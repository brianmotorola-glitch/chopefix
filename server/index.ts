import express, { type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { PORT, UPLOAD_DIR, CLIENT_DIR, DEMO_MODE, AUTO_RELEASE_MS, DEFAULT_FEE_BPS, DEFAULT_RESERVE_BPS, DB_PATH } from './config.ts';
import { all, one, run, tx, getSetting, type Row } from './db.ts';
import { loadUser, requireRole, hashPassword, verifyPassword, startSession, endSession, type AuthedRequest } from './auth.ts';
import { seedIfEmpty, DEMO_PASSWORD } from './seed.ts';
import { lookupPostal } from './geo.ts';
import { createSamplePhoto } from './samples.ts';
import { ACTIVE_STATUSES, logEvent, newRef, releasePayout, refundCustomer, runAutoRelease, serializeBooking, serializeCatalog, split } from './logic.ts';

const seeded = seedIfEmpty();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(loadUser);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
type Handler = (req: AuthedRequest, res: Response) => unknown;
const h = (fn: Handler) => (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const out = fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(out);
  } catch (e) { next(e); }
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
      cb(null, `photo-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new HttpError(400, 'Only JPEG, PNG, WEBP, HEIC or GIF photos are accepted.'));
  },
});

// Run the 24h auto-release sweeper on every API call and every 30s.
app.use('/api', (_req, _res, next) => { runAutoRelease(); next(); });
setInterval(runAutoRelease, 30_000).unref();

const cents = (v: unknown, label = 'Price'): number => {
  const n = Math.round(Number(v) * 100);
  if (!Number.isFinite(n) || n <= 0 || n > 500_000) fail(400, `${label} must be between S$0.01 and S$5,000.`);
  return n;
};
const str = (v: unknown, label: string, max = 500, required = true): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) fail(400, `${label} is required.`);
  return s.slice(0, max);
};
const money = (c: number) => `S$${(c / 100).toFixed(2)}`;

function loadBooking(id: unknown): Row {
  const b = one<Row>('SELECT * FROM bookings WHERE id = ?', Number(id));
  return b ?? fail(404, 'Booking not found.');
}
function canSee(req: AuthedRequest, b: Row) {
  const u = req.user!;
  return u.role === 'admin' || (u.role === 'customer' && b.customer_id === u.id) || (u.role === 'contractor' && b.contractor_id === u.contractor_id);
}
function ownCustomerBooking(req: AuthedRequest): Row {
  const b = loadBooking(req.params.id);
  if (req.user!.role !== 'admin' && b.customer_id !== req.user!.id) fail(403, 'This booking belongs to another customer.');
  return b;
}
function ownContractorBooking(req: AuthedRequest): Row {
  const b = loadBooking(req.params.id);
  if (b.contractor_id !== req.user!.contractor_id) fail(403, 'This job is assigned to another contractor.');
  return b;
}
function photoGeo(req: AuthedRequest, b: Row) {
  const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
  const valid = Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  return valid ? { lat, lng } : { lat: b.lat, lng: b.lng };
}
/** Stores either the uploaded multipart file or a generated sample photo. */
function savePhoto(req: AuthedRequest, b: Row, kind: 'before' | 'after' | 'rework', claimId: number | null = null) {
  const geo = photoGeo(req, b);
  const now = Date.now();
  const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
  let url: string, sample = 0;
  if (file) url = `/uploads/${file.filename}`;
  else if (req.body?.sample === 'true' || req.body?.sample === true || req.body?.sample === '1') {
    url = createSamplePhoto({ trade: b.trade, kind, ref: b.ref, lat: geo.lat, lng: geo.lng, takenAt: now });
    sample = 1;
  } else return fail(400, 'Attach a photo (or choose the sample photo) as proof.');
  run('INSERT INTO photos (booking_id, claim_id, kind, url, lat, lng, taken_at, is_sample) VALUES (?,?,?,?,?,?,?,?)', b.id, claimId, kind, url, geo.lat, geo.lng, now, sample);
  return { url, ...geo, takenAt: now };
}
const customerView = (b: Row) => serializeBooking(b);
const contractorView = (b: Row) => serializeBooking(b, { hideAddress: b.status === 'requested' });

/* ----------------------------- health & meta ----------------------------- */
app.get('/api/health', h(() => ({ ok: true, service: 'chopefix', time: new Date().toISOString(), db: DB_PATH, demoMode: DEMO_MODE })));
app.get('/api/settings', h(() => ({ feeBps: getSetting('fee_bps', DEFAULT_FEE_BPS), reserveBps: getSetting('reserve_bps', DEFAULT_RESERVE_BPS), autoReleaseHours: AUTO_RELEASE_MS / 3600000, warrantyDays: 30, demoMode: DEMO_MODE })));

/* ---------------------------------- auth --------------------------------- */
const meOut = (userId: number) => {
  const u = one<Row>('SELECT u.id, u.email, u.name, u.phone, u.role, u.is_demo, c.id AS contractor_id FROM users u LEFT JOIN contractors c ON c.user_id = u.id WHERE u.id = ?', userId)!;
  const c = u.contractor_id ? one<Row>('SELECT trade, verified, licence_type, licence_no, initials FROM contractors WHERE id = ?', u.contractor_id) : null;
  return { id: u.id, email: u.email, name: u.name, phone: u.phone, role: u.role, isDemo: !!u.is_demo, contractor: c ? { id: u.contractor_id, trade: c.trade, verified: !!c.verified, licenceType: c.licence_type, licenceNo: c.licence_no, initials: c.initials } : null };
};
app.get('/api/auth/me', h((req) => ({ user: req.user ? meOut(req.user.id) : null })));
app.post('/api/auth/register', h((req, res) => {
  const name = str(req.body?.name, 'Name', 80);
  const email = str(req.body?.email, 'Email', 120).toLowerCase();
  const password = String(req.body?.password ?? '');
  const phone = str(req.body?.phone, 'Phone', 30, false);
  const role = req.body?.role === 'contractor' ? 'contractor' : 'customer';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters.');
  if (one('SELECT id FROM users WHERE email = ?', email)) fail(409, 'An account with this email already exists.');
  const id = tx(() => {
    const uid = Number(run('INSERT INTO users (email, name, phone, password_hash, role, created_at) VALUES (?,?,?,?,?,?)', email, name, phone || null, hashPassword(password), role, Date.now()).lastInsertRowid);
    if (role === 'contractor') {
      const trade = ['Plumbing', 'Electrical', 'Handyman'].includes(req.body?.trade) ? req.body.trade : 'Handyman';
      const licenceNo = str(req.body?.licenceNo, 'Licence / ID number', 40, false) || 'PENDING';
      const lt = trade === 'Electrical' ? 'EMA Licensed Electrical Worker (LEW)' : trade === 'Plumbing' ? 'PUB simple plumbing scope · ID verified' : 'ChopeFix vetted';
      const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
      run('INSERT INTO contractors (user_id, trade, licence_type, licence_no, verified, rating, jobs_done, years_exp, bio, initials) VALUES (?,?,?,?,0,5,0,1,?,?)', uid, trade, lt, licenceNo, 'New on ChopeFix · verification pending.', initials);
    }
    return uid;
  });
  startSession(res, id);
  res.status(201);
  return { user: meOut(id) };
}));
app.post('/api/auth/login', h((req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const u = one<Row>('SELECT id, password_hash FROM users WHERE email = ?', email);
  if (!u || !verifyPassword(String(req.body?.password ?? ''), u.password_hash)) fail(401, 'Incorrect email or password.');
  startSession(res, u!.id);
  return { user: meOut(u!.id) };
}));
app.post('/api/auth/logout', h((req, res) => { endSession(req, res); return { ok: true }; }));
app.get('/api/demo/accounts', h(() => {
  if (!DEMO_MODE) return { accounts: [] };
  return {
    password: DEMO_PASSWORD,
    accounts: all<Row>(`SELECT u.email, u.name, u.role, c.trade, c.licence_type FROM users u LEFT JOIN contractors c ON c.user_id = u.id WHERE u.is_demo = 1 ORDER BY CASE u.role WHEN 'customer' THEN 0 WHEN 'contractor' THEN 1 ELSE 2 END, u.id`)
      .map((a) => ({ email: a.email, name: a.name, role: a.role, trade: a.trade, licenceType: a.licence_type })),
  };
}));
app.post('/api/auth/demo', h((req, res) => {
  if (!DEMO_MODE) fail(403, 'Demo mode is disabled.');
  const u = one<Row>('SELECT id FROM users WHERE email = ? AND is_demo = 1', String(req.body?.email ?? ''));
  if (!u) fail(404, 'Unknown demo account.');
  endSession(req, res);
  startSession(res, u!.id);
  return { user: meOut(u!.id) };
}));

/* -------------------------------- catalog -------------------------------- */
app.get('/api/catalog', h(() => ({ items: all('SELECT * FROM catalog WHERE active = 1 ORDER BY trade, price_cents').map(serializeCatalog) })));

/* ------------------------------- bookings -------------------------------- */
app.get('/api/bookings', requireRole(), h((req) => {
  const u = req.user!;
  const rows = u.role === 'admin' ? all('SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200')
    : u.role === 'customer' ? all('SELECT * FROM bookings WHERE customer_id = ? ORDER BY created_at DESC', u.id)
    : all('SELECT * FROM bookings WHERE contractor_id = ? ORDER BY created_at DESC', u.contractor_id);
  return { items: rows.map((b) => (u.role === 'contractor' ? contractorView(b) : customerView(b))) };
}));
app.get('/api/bookings/:id', requireRole(), h((req) => {
  const b = loadBooking(req.params.id);
  if (!canSee(req, b)) fail(403, 'You do not have access to this booking.');
  return { booking: req.user!.role === 'contractor' ? contractorView(b) : customerView(b) };
}));
app.post('/api/bookings', requireRole('customer'), h((req, res) => {
  const c = one<Row>('SELECT * FROM catalog WHERE id = ? AND active = 1', Number(req.body?.catalogId)) ?? fail(404, 'That job is no longer in the catalog.');
  const postal = String(req.body?.postalCode ?? '').trim();
  const geo = lookupPostal(postal) ?? fail(400, 'Enter a valid 6-digit Singapore postal code.');
  const unit = str(req.body?.unitNo, 'Unit number', 20);
  const windowDate = str(req.body?.windowDate, 'Arrival date', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(windowDate)) fail(400, 'Arrival date must be YYYY-MM-DD.');
  const windowSlot = str(req.body?.windowSlot, 'Arrival window', 30);
  const rail = req.body?.paymentRail === 'card' ? 'card' : req.body?.paymentRail === 'paynow' ? 'paynow' : fail(400, 'Choose PayNow or Card.');
  if (req.body?.paymentAuthorized !== true) fail(402, 'Payment hold was not authorised. Complete the PayNow / card step first.');
  const ref = newRef();
  const paymentRef = rail === 'paynow' ? `PN-${ref.slice(3)}-HOLD` : `AUTH-${ref.slice(3)}-${String(req.body?.cardLast4 ?? '4242').replace(/\D/g, '').slice(-4) || '4242'}`;
  const now = Date.now();
  const id = tx(() => {
    const bid = Number(run(`INSERT INTO bookings (ref, customer_id, catalog_id, status, job_title, trade, base_cents, fee_bps, reserve_bps, postal_code, unit_no, area, lat, lng, notes, window_date, window_slot, has_part, payment_rail, payment_ref, created_at)
      VALUES (?,?,?,'requested',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ref, req.user!.id, c!.id, c!.title, c!.trade, c!.price_cents, getSetting('fee_bps', DEFAULT_FEE_BPS), getSetting('reserve_bps', DEFAULT_RESERVE_BPS),
      postal, unit, geo!.area, geo!.lat, geo!.lng, str(req.body?.notes, 'Notes', 500, false), windowDate, windowSlot, req.body?.hasPart ? 1 : 0, rail, paymentRef, now).lastInsertRowid);
    logEvent(bid, req.user!.name, `Booked at fixed price ${money(c!.price_cents)} · ${rail === 'paynow' ? 'PayNow' : 'card authorisation'} hold placed in escrow (${paymentRef}).`, now);
    return bid;
  });
  res.status(201);
  return { booking: customerView(loadBooking(id)) };
}));
app.post('/api/bookings/:id/cancel', requireRole('customer', 'admin'), h((req) => {
  const b = ownCustomerBooking(req);
  if (!['requested', 'accepted'].includes(b.status)) fail(409, 'Only bookings that have not started can be cancelled.');
  run("UPDATE bookings SET status='cancelled', refunded_at=? WHERE id=?", Date.now(), b.id);
  logEvent(b.id, req.user!.name, `Booking cancelled before work started. Hold of ${money(b.base_cents)} released back to customer.`);
  return { booking: customerView(loadBooking(b.id)) };
}));
app.post('/api/bookings/:id/addons/:addonId/decision', requireRole('customer'), h((req) => {
  const b = ownCustomerBooking(req);
  const a = one<Row>('SELECT * FROM addons WHERE id = ? AND booking_id = ?', Number(req.params.addonId), b.id) ?? fail(404, 'Add-on not found.');
  if (a!.status !== 'pending') fail(409, 'This add-on was already decided.');
  const approve = req.body?.approve === true;
  run('UPDATE addons SET status = ?, decided_at = ? WHERE id = ?', approve ? 'approved' : 'declined', Date.now(), a!.id);
  logEvent(b.id, req.user!.name, approve ? `Approved add-on "${a!.label}" ${money(a!.price_cents)} in app · added to escrow hold & covered by 30-day warranty.` : `Declined add-on "${a!.label}" ${money(a!.price_cents)}.`);
  return { booking: customerView(loadBooking(b.id)) };
}));
app.post('/api/bookings/:id/mark-done', requireRole('customer'), h((req) => {
  const b = ownCustomerBooking(req);
  if (b.status !== 'awaiting_confirmation') fail(409, 'The contractor has not submitted completion photos yet.');
  releasePayout(b.id, 'customer', req.user!.name);
  return { booking: customerView(loadBooking(b.id)) };
}));
app.post('/api/bookings/:id/simulate-auto-release', requireRole(), h((req) => {
  if (!DEMO_MODE) fail(403, 'Demo controls are disabled.');
  const b = loadBooking(req.params.id);
  if (!canSee(req, b)) fail(403, 'You do not have access to this booking.');
  if (b.status !== 'awaiting_confirmation') fail(409, 'Auto-release only applies after completion photos are submitted and before any dispute.');
  run('UPDATE bookings SET auto_release_at = ? WHERE id = ?', Date.now() - 1, b.id);
  logEvent(b.id, 'Demo', 'Demo control: fast-forwarded the 24-hour confirmation window.');
  runAutoRelease();
  return { booking: req.user!.role === 'contractor' ? contractorView(loadBooking(b.id)) : customerView(loadBooking(b.id)) };
}));
app.post('/api/bookings/:id/report-issue', requireRole('customer'), h((req) => {
  const b = ownCustomerBooking(req);
  if (!['in_progress', 'awaiting_confirmation'].includes(b.status)) fail(409, 'Issues can be reported while the job is in progress or awaiting your confirmation.');
  const reason = str(req.body?.reason, 'Reason', 120);
  tx(() => {
    run("UPDATE bookings SET status='disputed', auto_release_at=NULL WHERE id=?", b.id);
    run("INSERT INTO disputes (booking_id, reason, details, status, created_at) VALUES (?,?,?,'open',?)", b.id, reason, str(req.body?.details, 'Details', 1000, false), Date.now());
    logEvent(b.id, req.user!.name, `Reported an issue: "${reason}". Payout paused · ChopeFix Ops will review within 1 business day.`);
  });
  return { booking: customerView(loadBooking(b.id)) };
}));
app.post('/api/bookings/:id/claims', requireRole('customer'), h((req, res) => {
  const b = ownCustomerBooking(req);
  if (b.status !== 'completed' || !b.warranty_until || b.warranty_until < Date.now()) fail(409, 'Warranty claims are available for completed jobs within 30 days.');
  if (one("SELECT id FROM claims WHERE booking_id = ? AND status = 'open'", b.id)) fail(409, 'There is already an open rework ticket for this job.');
  const issue = str(req.body?.issue, 'Issue description', 1000);
  const id = Number(run("INSERT INTO claims (booking_id, issue, status, created_at) VALUES (?,?,'open',?)", b.id, issue, Date.now()).lastInsertRowid);
  logEvent(b.id, req.user!.name, `Filed a ChopeFix Protection warranty claim: "${issue}". Rework ticket dispatched to the original contractor at no cost.`);
  res.status(201);
  return { claimId: id, booking: customerView(loadBooking(b.id)) };
}));

/* ------------------------------- contractor ------------------------------ */
const contractorOnly = requireRole('contractor');
app.get('/api/contractor/feed', contractorOnly, h((req) => {
  const c = one<Row>('SELECT * FROM contractors WHERE id = ?', req.user!.contractor_id)!;
  const rows = all("SELECT * FROM bookings WHERE status = 'requested' AND contractor_id IS NULL AND trade = ? ORDER BY window_date, created_at", c.trade);
  return { verified: !!c.verified, trade: c.trade, items: rows.map(contractorView) };
}));
app.post('/api/contractor/bookings/:id/accept', contractorOnly, h((req) => {
  const c = one<Row>('SELECT * FROM contractors WHERE id = ?', req.user!.contractor_id)!;
  if (!c.verified) fail(403, 'Your licence/ID verification is still pending. Ops will verify you shortly.');
  const b = loadBooking(req.params.id);
  if (b.trade !== c.trade) fail(403, `This is a ${b.trade} job.`);
  const r = run("UPDATE bookings SET contractor_id = ?, status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'requested' AND contractor_id IS NULL", c.id, Date.now(), b.id);
  if (Number(r.changes) === 0) fail(409, 'Sorry, another contractor already chope-d this job.');
  logEvent(b.id, req.user!.name, `Job accepted. ${c.licence_type} verified (${c.licence_no}).`);
  return { booking: contractorView(loadBooking(b.id)) };
}));
app.post('/api/contractor/bookings/:id/check-in', contractorOnly, upload.single('photo'), h((req) => {
  const b = ownContractorBooking(req);
  if (b.status !== 'accepted') fail(409, 'You can only check in to an accepted job.');
  const p = savePhoto(req, b, 'before');
  run("UPDATE bookings SET status='in_progress', checked_in_at=? WHERE id=?", p.takenAt, b.id);
  logEvent(b.id, req.user!.name, `Checked in on site with geo-tagged Before photo (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}).`);
  return { booking: contractorView(loadBooking(b.id)) };
}));
app.post('/api/contractor/bookings/:id/addons', contractorOnly, h((req, res) => {
  const b = ownContractorBooking(req);
  if (b.status !== 'in_progress') fail(409, 'Add-ons can be logged after check-in and before completion.');
  const label = str(req.body?.label, 'Add-on item', 80);
  const price = cents(req.body?.price, 'Add-on price');
  if (price > 30_000) fail(400, 'On-site add-ons are capped at S$300. Larger work needs a separate booking.');
  run("INSERT INTO addons (booking_id, label, price_cents, status, created_at) VALUES (?,?,?,'pending',?)", b.id, label, price, Date.now());
  logEvent(b.id, req.user!.name, `Logged on-site add-on: ${label} (${money(price)}) · awaiting customer approval.`);
  res.status(201);
  return { booking: contractorView(loadBooking(b.id)) };
}));
app.post('/api/contractor/bookings/:id/complete', contractorOnly, upload.single('photo'), h((req) => {
  const b = ownContractorBooking(req);
  if (b.status !== 'in_progress') fail(409, 'Check in with a Before photo first.');
  if (one("SELECT id FROM addons WHERE booking_id = ? AND status = 'pending'", b.id)) fail(409, 'An add-on is still awaiting customer approval.');
  const p = savePhoto(req, b, 'after');
  const note = str(req.body?.note, 'Completion note', 500, false);
  run("UPDATE bookings SET status='awaiting_confirmation', completed_at=?, auto_release_at=?, completion_note=? WHERE id=?", p.takenAt, p.takenAt + AUTO_RELEASE_MS, note || null, b.id);
  logEvent(b.id, req.user!.name, `Uploaded After completion photo${note ? ` · "${note}"` : ''}. 24-hour auto-release countdown started.`);
  return { booking: contractorView(loadBooking(b.id)) };
}));
app.get('/api/contractor/claims', contractorOnly, h((req) => {
  const rows = all<Row>(`SELECT cl.*, b.id AS bid FROM claims cl JOIN bookings b ON b.id = cl.booking_id WHERE b.contractor_id = ? ORDER BY cl.status = 'open' DESC, cl.created_at DESC`, req.user!.contractor_id);
  return { items: rows.map((r) => ({ id: r.id, issue: r.issue, status: r.status, contractorNote: r.contractor_note, createdAt: r.created_at, resolvedAt: r.resolved_at, booking: contractorView(loadBooking(r.bid)) })) };
}));
app.post('/api/contractor/claims/:claimId/resolve', contractorOnly, upload.single('photo'), h((req) => {
  const cl = one<Row>('SELECT * FROM claims WHERE id = ?', Number(req.params.claimId)) ?? fail(404, 'Rework ticket not found.');
  const b = loadBooking(cl!.booking_id);
  if (b.contractor_id !== req.user!.contractor_id) fail(403, 'This rework ticket belongs to another contractor.');
  if (cl!.status !== 'open') fail(409, 'This rework ticket is already resolved.');
  savePhoto(req, b, 'rework', cl!.id);
  const note = str(req.body?.note, 'Rework note', 500, false) || 'Rework completed.';
  run("UPDATE claims SET status='resolved', contractor_note=?, resolved_at=? WHERE id=?", note, Date.now(), cl!.id);
  logEvent(b.id, req.user!.name, `Warranty rework completed with fresh photo proof · "${note}". No charge to customer.`);
  return { booking: contractorView(loadBooking(b.id)) };
}));
app.get('/api/contractor/ledger', contractorOnly, h((req) => {
  const rows = all<Row>('SELECT * FROM bookings WHERE contractor_id = ? ORDER BY COALESCE(released_at, created_at) DESC', req.user!.contractor_id);
  const now = Date.now();
  const t = { heldEscrow: 0, heldNet: 0, grossReleased: 0, fees: 0, reserveHeld: 0, reserveReleased: 0, netReleased: 0, jobsReleased: 0, refunded: 0 };
  const entries = rows.map((r) => {
    const v = serializeBooking(r);
    if (['accepted', 'in_progress', 'awaiting_confirmation', 'disputed'].includes(r.status)) { t.heldEscrow += v.amounts.gross; t.heldNet += v.amounts.net; }
    if (r.status === 'completed') {
      t.grossReleased += r.gross_cents; t.fees += r.fee_cents; t.netReleased += r.net_cents; t.jobsReleased++;
      if (r.warranty_until > now) t.reserveHeld += r.reserve_cents; else t.reserveReleased += r.reserve_cents;
    }
    if (r.status === 'refunded') t.refunded += v.amounts.gross;
    return { id: r.id, ref: r.ref, jobTitle: r.job_title, status: r.status, at: r.released_at ?? r.created_at, releaseType: r.release_type, warrantyUntil: r.warranty_until, ...v.amounts };
  });
  return { totals: t, entries };
}));

/* --------------------------------- admin --------------------------------- */
const adminOnly = requireRole('admin');
app.get('/api/admin/kpis', adminOnly, h(() => {
  const now = Date.now();
  const rows = all<Row>('SELECT * FROM bookings');
  const k = { gmv: 0, escrowHeld: 0, feesEarned: 0, reserveHeld: 0, completedJobs: 0, openDisputes: 0, activeWarranties: 0, openClaims: 0, totalBookings: rows.length, liveJobs: 0, refunded: 0, avgTicket: 0 };
  for (const r of rows) {
    const v = serializeBooking(r);
    if (r.status === 'completed') { k.gmv += r.gross_cents; k.feesEarned += r.fee_cents; k.completedJobs++; if (r.warranty_until > now) { k.activeWarranties++; k.reserveHeld += r.reserve_cents; } }
    else if (ACTIVE_STATUSES.includes(r.status)) { k.gmv += v.amounts.gross; k.escrowHeld += v.amounts.gross; k.liveJobs++; }
    else if (r.status === 'refunded') k.refunded += r.gross_cents ?? 0;
  }
  k.openDisputes = one<{ n: number }>("SELECT COUNT(*) AS n FROM disputes WHERE status='open'")!.n;
  k.openClaims = one<{ n: number }>("SELECT COUNT(*) AS n FROM claims WHERE status='open'")!.n;
  const paid = rows.filter((r) => !['cancelled', 'refunded'].includes(r.status)).length;
  k.avgTicket = paid ? Math.round(k.gmv / paid) : 0;
  const byTrade = all<Row>("SELECT trade, COUNT(*) AS n FROM bookings WHERE status NOT IN ('cancelled') GROUP BY trade");
  const byStatus = all<Row>('SELECT status, COUNT(*) AS n FROM bookings GROUP BY status');
  return { kpis: k, byTrade, byStatus, feeBps: getSetting('fee_bps', DEFAULT_FEE_BPS), reserveBps: getSetting('reserve_bps', DEFAULT_RESERVE_BPS) };
}));
app.get('/api/admin/queue', adminOnly, h(() => {
  const disputes = all<Row>("SELECT d.*, d.id AS did FROM disputes d ORDER BY d.status = 'open' DESC, d.created_at DESC").map((d) => ({
    id: d.did, reason: d.reason, details: d.details, status: d.status, resolutionNote: d.resolution_note, createdAt: d.created_at, resolvedAt: d.resolved_at, booking: customerView(loadBooking(d.booking_id)),
  }));
  const claims = all<Row>("SELECT * FROM claims ORDER BY status = 'open' DESC, created_at DESC").map((c) => ({
    id: c.id, issue: c.issue, status: c.status, contractorNote: c.contractor_note, createdAt: c.created_at, resolvedAt: c.resolved_at, booking: customerView(loadBooking(c.booking_id)),
  }));
  const warranties = all<Row>("SELECT * FROM bookings WHERE status='completed' AND warranty_until > ? ORDER BY warranty_until", Date.now()).map(customerView);
  return { disputes, claims, warranties };
}));
app.post('/api/admin/disputes/:id/resolve', adminOnly, h((req) => {
  const d = one<Row>('SELECT * FROM disputes WHERE id = ?', Number(req.params.id)) ?? fail(404, 'Dispute not found.');
  if (d!.status !== 'open') fail(409, 'Dispute already resolved.');
  const action = req.body?.action === 'release' ? 'release' : req.body?.action === 'refund' ? 'refund' : fail(400, 'Action must be release or refund.');
  const note = str(req.body?.note, 'Resolution note', 500, false) || (action === 'release' ? 'Work verified from photo proof.' : 'Work not delivered to standard.');
  tx(() => {
    run('UPDATE disputes SET status = ?, resolution_note = ?, resolved_at = ? WHERE id = ?', action === 'release' ? 'released' : 'refunded', note, Date.now(), d!.id);
    logEvent(d!.booking_id, 'ChopeFix Ops', `Dispute resolved: ${note}`);
  });
  if (action === 'release') releasePayout(d!.booking_id, 'ops', 'ChopeFix Ops');
  else refundCustomer(d!.booking_id, 'ChopeFix Ops', '');
  return { booking: customerView(loadBooking(d!.booking_id)) };
}));
app.get('/api/admin/catalog', adminOnly, h(() => ({ items: all('SELECT * FROM catalog ORDER BY trade, price_cents').map(serializeCatalog) })));
function catalogInput(body: Row) {
  const trade = ['Plumbing', 'Electrical', 'Handyman'].includes(body?.trade) ? body.trade : fail(400, 'Trade must be Plumbing, Electrical or Handyman.');
  const duration = Math.round(Number(body?.durationMin));
  if (!(duration >= 15 && duration <= 240)) fail(400, 'Duration must be 15–240 minutes.');
  const scope = (Array.isArray(body?.scope) ? body.scope : String(body?.scope ?? '').split('\n')).map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 8);
  if (!scope.length) fail(400, 'List at least one included scope item.');
  const compliance = trade === 'Plumbing' ? 'PUB simple plumbing scope' : trade === 'Electrical' ? 'EMA LEW verified contractor' : 'ChopeFix vetted · insured';
  return { trade, title: str(body?.title, 'Title', 80), summary: str(body?.summary, 'Summary', 200), scope, duration, price: cents(body?.price), compliance: str(body?.compliance, 'Compliance', 60, false) || compliance };
}
app.post('/api/admin/catalog', adminOnly, h((req, res) => {
  const c = catalogInput(req.body);
  const id = Number(run('INSERT INTO catalog (trade, title, summary, scope, exclusions, duration_min, price_cents, compliance, active, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?)', c.trade, c.title, c.summary, JSON.stringify(c.scope), '[]', c.duration, c.price, c.compliance, Date.now()).lastInsertRowid);
  res.status(201);
  return { item: serializeCatalog(one('SELECT * FROM catalog WHERE id = ?', id)!) };
}));
app.put('/api/admin/catalog/:id', adminOnly, h((req) => {
  const existing = one<Row>('SELECT * FROM catalog WHERE id = ?', Number(req.params.id)) ?? fail(404, 'Catalog item not found.');
  const c = catalogInput({ ...serializeCatalog(existing!), price: existing!.price_cents / 100, ...req.body });
  const active = req.body?.active === undefined ? existing!.active : req.body.active ? 1 : 0;
  run('UPDATE catalog SET trade=?, title=?, summary=?, scope=?, duration_min=?, price_cents=?, compliance=?, active=?, updated_at=? WHERE id=?', c.trade, c.title, c.summary, JSON.stringify(c.scope), c.duration, c.price, c.compliance, active, Date.now(), existing!.id);
  return { item: serializeCatalog(one('SELECT * FROM catalog WHERE id = ?', existing!.id)!) };
}));
app.get('/api/admin/contractors', adminOnly, h(() => ({
  items: all<Row>('SELECT c.*, u.name, u.email, u.phone FROM contractors c JOIN users u ON u.id = c.user_id ORDER BY c.verified, c.id').map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone, trade: c.trade, licenceType: c.licence_type, licenceNo: c.licence_no, verified: !!c.verified, rating: c.rating, jobsDone: c.jobs_done, initials: c.initials,
  })),
})));
app.post('/api/admin/contractors/:id/verify', adminOnly, h((req) => {
  run('UPDATE contractors SET verified = ? WHERE id = ?', req.body?.verified === false ? 0 : 1, Number(req.params.id));
  return { ok: true };
}));
app.get('/api/admin/fee-preview', adminOnly, h((req) => split(Math.round(Number(req.query.gross ?? 0)), getSetting('fee_bps', DEFAULT_FEE_BPS), getSetting('reserve_bps', DEFAULT_RESERVE_BPS))));

app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found' }); });

/* ------------------------------ static files ----------------------------- */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('ChopeFix API is running. Build the frontend with `npm run build`, or use `npm run dev` (Vite on :5173).'));
}

app.use((err: any, _req: AuthedRequest, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : err?.code === 'LIMIT_FILE_SIZE' ? 413 : err?.status && err.status < 500 ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.message || 'Request failed' });
});

const server = app.listen(PORT, () => {
  console.log(`ChopeFix running on http://localhost:${PORT}  (db: ${DB_PATH}${seeded ? ', freshly seeded' : ''})`);
});
const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

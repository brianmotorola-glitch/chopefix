import crypto from 'node:crypto';
import { all, one, run, tx, type Row } from './db.ts';
import { WARRANTY_MS } from './config.ts';

export const ACTIVE_STATUSES = ['requested', 'accepted', 'in_progress', 'awaiting_confirmation', 'disputed'];

export function newRef(prefix = 'CF'): string {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function logEvent(bookingId: number, actor: string, message: string, at = Date.now()) {
  run('INSERT INTO events (booking_id, at, actor, message) VALUES (?, ?, ?, ?)', bookingId, at, actor, message);
}

export function split(gross: number, feeBps: number, reserveBps: number) {
  const fee = Math.round((gross * feeBps) / 10000);
  const reserve = Math.round((gross * reserveBps) / 10000);
  return { gross, fee, reserve, net: gross - fee - reserve };
}

export function grossFor(bookingId: number): { base: number; addons: number; gross: number } {
  const b = one<Row>('SELECT base_cents FROM bookings WHERE id = ?', bookingId)!;
  const a = one<{ s: number }>("SELECT COALESCE(SUM(price_cents),0) AS s FROM addons WHERE booking_id = ? AND status = 'approved'", bookingId)!;
  return { base: b.base_cents, addons: a.s, gross: b.base_cents + a.s };
}

/** Release held funds to the contractor (customer confirm, 24h auto-release, or ops decision). */
export function releasePayout(bookingId: number, type: 'customer' | 'auto' | 'ops', actor: string) {
  tx(() => {
    const b = one<Row>('SELECT * FROM bookings WHERE id = ?', bookingId)!;
    const { gross } = grossFor(bookingId);
    const s = split(gross, b.fee_bps, b.reserve_bps);
    const now = Date.now();
    run(
      `UPDATE bookings SET status='completed', released_at=?, release_type=?, auto_release_at=NULL, warranty_until=?,
         gross_cents=?, fee_cents=?, reserve_cents=?, net_cents=? WHERE id=?`,
      now, type, now + WARRANTY_MS, s.gross, s.fee, s.reserve, s.net, bookingId,
    );
    if (b.contractor_id) run('UPDATE contractors SET jobs_done = jobs_done + 1 WHERE id = ?', b.contractor_id);
    const how = { customer: 'Customer marked the job as done', auto: '24-hour auto-release triggered', ops: 'Ops resolved the dispute in favour of the contractor' }[type];
    logEvent(bookingId, actor, `${how}. Payout released: S$${(s.net / 100).toFixed(2)} net to contractor (fee S$${(s.fee / 100).toFixed(2)}, reserve S$${(s.reserve / 100).toFixed(2)}). 30-day ChopeFix Protection is now active.`);
  });
}

export function refundCustomer(bookingId: number, actor: string, reason: string) {
  const { gross } = grossFor(bookingId);
  run("UPDATE bookings SET status='refunded', refunded_at=?, auto_release_at=NULL, gross_cents=?, fee_cents=0, reserve_cents=0, net_cents=0 WHERE id=?", Date.now(), gross, bookingId);
  logEvent(bookingId, actor, `Held funds of S$${(gross / 100).toFixed(2)} refunded to the customer. ${reason}`.trim());
}

/** Sweeps bookings whose 24h confirmation window has elapsed. Safe to call often. */
export function runAutoRelease(): number {
  const due = all<{ id: number }>("SELECT id FROM bookings WHERE status='awaiting_confirmation' AND auto_release_at IS NOT NULL AND auto_release_at <= ?", Date.now());
  for (const b of due) releasePayout(b.id, 'auto', 'System');
  return due.length;
}

export function contractorPublic(contractorId: number | null) {
  if (!contractorId) return null;
  const c = one<Row>('SELECT c.*, u.name, u.phone FROM contractors c JOIN users u ON u.id = c.user_id WHERE c.id = ?', contractorId);
  if (!c) return null;
  return {
    id: c.id, name: c.name, phone: c.phone, trade: c.trade, licenceType: c.licence_type, licenceNo: c.licence_no,
    verified: !!c.verified, rating: c.rating, jobsDone: c.jobs_done, yearsExp: c.years_exp, bio: c.bio, initials: c.initials,
  };
}

export function serializeBooking(b: Row, opts: { hideAddress?: boolean } = {}) {
  const cat = one<Row>('SELECT * FROM catalog WHERE id = ?', b.catalog_id);
  const addons = all<Row>('SELECT * FROM addons WHERE booking_id = ? ORDER BY id', b.id);
  const photos = all<Row>('SELECT * FROM photos WHERE booking_id = ? ORDER BY taken_at, id', b.id);
  const claims = all<Row>('SELECT * FROM claims WHERE booking_id = ? ORDER BY id', b.id);
  const disputes = all<Row>('SELECT * FROM disputes WHERE booking_id = ? ORDER BY id DESC', b.id);
  const events = all<Row>('SELECT at, actor, message FROM events WHERE booking_id = ? ORDER BY at, id', b.id);
  const customer = one<Row>('SELECT name, phone FROM users WHERE id = ?', b.customer_id);
  const approved = addons.filter((a) => a.status === 'approved').reduce((s, a) => s + a.price_cents, 0);
  const gross = b.base_cents + approved;
  const s = b.status === 'completed' && b.gross_cents != null
    ? { gross: b.gross_cents, fee: b.fee_cents, reserve: b.reserve_cents, net: b.net_cents }
    : b.status === 'refunded' || b.status === 'cancelled'
      ? { gross, fee: 0, reserve: 0, net: 0 }
      : split(gross, b.fee_bps, b.reserve_bps);
  const now = Date.now();
  const photo = (p: Row) => ({ id: p.id, kind: p.kind, url: p.url, lat: p.lat, lng: p.lng, takenAt: p.taken_at, isSample: !!p.is_sample, claimId: p.claim_id });
  return {
    id: b.id, ref: b.ref, status: b.status, trade: b.trade, jobTitle: b.job_title,
    job: cat ? { id: cat.id, title: cat.title, summary: cat.summary, scope: JSON.parse(cat.scope), durationMin: cat.duration_min, compliance: cat.compliance } : null,
    customer: { name: customer?.name ?? 'Customer', phone: opts.hideAddress ? null : customer?.phone ?? null },
    contractor: contractorPublic(b.contractor_id),
    address: { postalCode: opts.hideAddress ? `${b.postal_code.slice(0, 2)}xxxx` : b.postal_code, unitNo: opts.hideAddress ? '' : b.unit_no, area: b.area, lat: b.lat, lng: b.lng },
    notes: b.notes, windowDate: b.window_date, windowSlot: b.window_slot, hasPart: !!b.has_part,
    payment: { rail: b.payment_rail, ref: b.payment_ref },
    amounts: { base: b.base_cents, addonsApproved: approved, gross: s.gross, fee: s.fee, reserve: s.reserve, net: s.net, feeBps: b.fee_bps, reserveBps: b.reserve_bps },
    createdAt: b.created_at, acceptedAt: b.accepted_at, checkedInAt: b.checked_in_at, completedAt: b.completed_at,
    autoReleaseAt: b.auto_release_at, releasedAt: b.released_at, releaseType: b.release_type, refundedAt: b.refunded_at,
    warrantyUntil: b.warranty_until, warrantyActive: b.status === 'completed' && !!b.warranty_until && b.warranty_until > now,
    completionNote: b.completion_note,
    addons: addons.map((a) => ({ id: a.id, label: a.label, price: a.price_cents, status: a.status, createdAt: a.created_at, decidedAt: a.decided_at })),
    photos: photos.map(photo),
    claims: claims.map((c) => ({ id: c.id, issue: c.issue, status: c.status, contractorNote: c.contractor_note, createdAt: c.created_at, resolvedAt: c.resolved_at })),
    dispute: disputes[0] ? { id: disputes[0].id, reason: disputes[0].reason, details: disputes[0].details, status: disputes[0].status, resolutionNote: disputes[0].resolution_note, createdAt: disputes[0].created_at, resolvedAt: disputes[0].resolved_at } : null,
    events,
  };
}

export function serializeCatalog(c: Row) {
  return {
    id: c.id, trade: c.trade, title: c.title, summary: c.summary, scope: JSON.parse(c.scope), exclusions: JSON.parse(c.exclusions),
    durationMin: c.duration_min, price: c.price_cents, compliance: c.compliance, active: !!c.active, updatedAt: c.updated_at,
  };
}

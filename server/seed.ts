import { one, run, tx } from './db.ts';
import { hashPassword } from './auth.ts';
import { DEFAULT_FEE_BPS, DEFAULT_RESERVE_BPS, WARRANTY_MS } from './config.ts';
import { createSamplePhoto } from './samples.ts';
import { split } from './logic.ts';
import { lookupPostal } from './geo.ts';

export const DEMO_PASSWORD = 'chopefix123';
const PUB = 'PUB simple plumbing scope';
const EMA = 'EMA LEW verified contractor';
const VET = 'ChopeFix vetted · insured';

const CATALOG: Array<[string, string, string, string[], string[], number, number, string]> = [
  ['Plumbing', 'Leaking tap / mixer repair', 'Stop a dripping basin or kitchen tap: washer, cartridge or O-ring fix.', ['Diagnose leak at 1 tap or mixer', 'Replace washer / O-ring / cartridge (standard)', 'Leak test & clean-up'], ['Concealed pipe works', 'Designer mixer parts'], 45, 6500, PUB],
  ['Plumbing', 'Choked basin or sink clearing', 'Manual clearing of a choked basin, sink or bottle trap.', ['Plunger & manual auger clearing', 'Remove & clean bottle trap', 'Flow test'], ['Floor trap / main stack chokes', 'Hydro-jetting'], 60, 8000, PUB],
  ['Plumbing', 'Toilet cistern flush repair', 'Fix a running or weak flush on a standard cistern.', ['Inspect inlet & flush valves', 'Adjust / replace flush mechanism (std.)', 'Fill & flush test'], ['Concealed cisterns', 'Toilet bowl replacement'], 45, 7500, PUB],
  ['Plumbing', 'Shower set / hose replacement', 'Swap a worn shower hose, head or rail set at an existing point.', ['Remove old shower set', 'Install hose, head & holder', 'Seal & leak test'], ['Re-piping / new water point', 'Water heater works'], 40, 6000, PUB],
  ['Electrical', '13A power socket replacement', 'Replace a faulty or scorched 13A socket at an existing point.', ['Isolate circuit & safety test', 'Replace 1 x 13A socket (std.)', 'Polarity & earth test'], ['New power points / rewiring', 'DB box works'], 45, 7000, EMA],
  ['Electrical', 'LED downlight / light fitting swap', 'Replace up to 3 downlights or 1 ceiling fitting at existing points.', ['Isolate & remove old fittings', 'Install up to 3 LED downlights', 'Function test'], ['New lighting points', 'False ceiling works'], 60, 8500, EMA],
  ['Electrical', 'Ceiling fan installation (existing point)', 'Install a customer-supplied ceiling fan on an existing fan point.', ['Assemble & mount fan (≤ 3 m ceiling)', 'Connect at existing point', 'Balance & remote pairing'], ['New fan point / wiring', 'Ceilings above 3 m'], 75, 12000, EMA],
  ['Electrical', 'Tripped circuit troubleshooting', 'Find out why your RCCB keeps tripping and isolate the faulty circuit.', ['Insulation resistance test', 'Isolate faulty appliance / circuit', 'Written findings in app'], ['Rewiring & DB replacement (quoted separately)'], 60, 9000, EMA],
  ['Handyman', 'Curtain rail / blind installation', 'Mount 1 curtain rail or roller blind up to 2 m wide.', ['Measure & level', 'Drill & mount brackets (concrete/gypsum)', 'Hang & test'], ['Motorised blinds', 'Rails above 2 m'], 60, 7000, VET],
  ['Handyman', 'TV wall mount (up to 65")', 'Mount a TV on a customer-supplied bracket, cables tidied.', ['Stud/concrete check & drill', 'Mount bracket & TV (≤ 65")', 'Basic cable tidy'], ['Concealed trunking in wall', 'TVs above 65"'], 60, 9500, VET],
  ['Handyman', 'Furniture assembly (1 medium item)', 'Assemble one flat-pack item such as a wardrobe, bed frame or desk.', ['Assemble 1 medium flat-pack item', 'Wall-anchor if required', 'Packaging consolidated'], ['Items over 2 m tall', 'Packaging disposal'], 75, 6500, VET],
];

export function seedIfEmpty() {
  const existing = one<{ n: number }>('SELECT COUNT(*) AS n FROM users')!;
  if (existing.n > 0) return false;
  const now = Date.now();
  const H = 60 * 60 * 1000;
  const D = 24 * H;
  tx(() => {
    run("INSERT INTO settings (key, value) VALUES ('fee_bps', ?), ('reserve_bps', ?)", String(DEFAULT_FEE_BPS), String(DEFAULT_RESERVE_BPS));
    for (const [trade, title, summary, scope, excl, mins, cents, compliance] of CATALOG) {
      run('INSERT INTO catalog (trade, title, summary, scope, exclusions, duration_min, price_cents, compliance, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        trade, title, summary, JSON.stringify(scope), JSON.stringify(excl), mins, cents, compliance, now);
    }
    const pw = hashPassword(DEMO_PASSWORD);
    const user = (email: string, name: string, phone: string, role: string) =>
      Number(run('INSERT INTO users (email, name, phone, password_hash, role, is_demo, created_at) VALUES (?,?,?,?,?,1,?)', email, name, phone, pw, role, now - 120 * D).lastInsertRowid);
    const customerId = user('rachel@chopefix.demo', 'Rachel Ng', '+65 9123 4567', 'customer');
    user('ops@chopefix.demo', 'ChopeFix Ops', '+65 6000 0000', 'admin');
    const contractor = (email: string, name: string, phone: string, trade: string, lt: string, ln: string, rating: number, jobs: number, yrs: number, bio: string, initials: string) => {
      const uid = user(email, name, phone, 'contractor');
      return Number(run('INSERT INTO contractors (user_id, trade, licence_type, licence_no, verified, rating, jobs_done, years_exp, bio, initials) VALUES (?,?,?,?,1,?,?,?,?,?)',
        uid, trade, lt, ln, rating, jobs, yrs, bio, initials).lastInsertRowid);
    };
    const weiMing = contractor('weiming@chopefix.demo', 'Wei Ming Tan', '+65 9811 2233', 'Plumbing', 'PUB simple plumbing scope · ID verified', 'CF-PL-0142', 4.9, 212, 11, 'Ex-HDB term contractor plumber. Taps, cisterns and choked sinks, same day.', 'WM');
    const farid = contractor('farid@chopefix.demo', 'Farid Rahman', '+65 9733 4455', 'Electrical', 'EMA Licensed Electrical Worker (LEW)', 'LEW-E8-20417', 4.8, 167, 9, 'EMA LEW, electrical technician grade. Sockets, lighting, fans & trip faults.', 'FR');
    contractor('jason@chopefix.demo', 'Jason Lim', '+65 9655 6677', 'Handyman', 'ChopeFix vetted · S$1M public liability', 'CF-HM-0088', 4.9, 304, 7, 'Mounting, assembly & carpentry touch-ups. Brings his own drill & level.', 'JL');

    const cat = (title: string) => one<{ id: number; price_cents: number; trade: string }>('SELECT id, price_cents, trade FROM catalog WHERE title = ?', title)!;
    const fee = DEFAULT_FEE_BPS, res = DEFAULT_RESERVE_BPS;
    const book = (ref: string, title: string, contractorId: number | null, status: string, postal: string, unit: string, date: string, slot: string, hasPart: number, rail: string, created: number, notes: string) => {
      const c = cat(title);
      const geo = lookupPostal(postal)!;
      const id = Number(run(`INSERT INTO bookings (ref, customer_id, catalog_id, contractor_id, status, job_title, trade, base_cents, fee_bps, reserve_bps, postal_code, unit_no, area, lat, lng, notes, window_date, window_slot, has_part, payment_rail, payment_ref, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ref, customerId, c.id, contractorId, status, title, c.trade, c.price_cents, fee, res, postal, unit, geo.area, geo.lat, geo.lng, notes, date, slot, hasPart, rail,
        rail === 'paynow' ? `PN-${ref.slice(3)}-HOLD` : `AUTH-${ref.slice(3)}-4242`, created).lastInsertRowid);
      return { id, geo, trade: c.trade, base: c.price_cents };
    };
    const ev = (bid: number, at: number, actor: string, msg: string) => run('INSERT INTO events (booking_id, at, actor, message) VALUES (?,?,?,?)', bid, at, actor, msg);
    const photo = (bid: number, ref: string, trade: string, kind: 'before' | 'after', at: number, lat: number, lng: number) =>
      run('INSERT INTO photos (booking_id, kind, url, lat, lng, taken_at, is_sample) VALUES (?,?,?,?,?,?,1)', bid, kind, createSamplePhoto({ trade, kind, ref, lat, lng, takenAt: at }), lat, lng, at);
    const sgDate = (ts: number) => new Date(ts + 8 * H).toISOString().slice(0, 10);

    // 1) Completed & released job with an approved on-site add-on -> active 30-day warranty
    const t0 = now - 3 * D - 5 * H;
    const a = book('CF-7Q2K4M', 'Leaking tap / mixer repair', weiMing, 'completed', '520231', '#08-112', sgDate(t0), '09:00–12:00', 0, 'paynow', t0, 'Kitchen mixer dripping non-stop, also hissing under the sink.');
    const addon = 2500;
    run("INSERT INTO addons (booking_id, label, price_cents, status, created_at, decided_at) VALUES (?, 'Corroded angle valve replacement', ?, 'approved', ?, ?)", a.id, addon, t0 + 2.2 * H, t0 + 2.25 * H);
    photo(a.id, 'CF-7Q2K4M', a.trade, 'before', t0 + 2 * H, a.geo.lat, a.geo.lng);
    photo(a.id, 'CF-7Q2K4M', a.trade, 'after', t0 + 2.8 * H, a.geo.lat, a.geo.lng);
    const s = split(a.base + addon, fee, res);
    const rel = t0 + 4 * H;
    run(`UPDATE bookings SET accepted_at=?, checked_in_at=?, completed_at=?, released_at=?, release_type='customer', warranty_until=?, completion_note=?, gross_cents=?, fee_cents=?, reserve_cents=?, net_cents=? WHERE id=?`,
      t0 + 0.3 * H, t0 + 2 * H, t0 + 2.8 * H, rel, rel + WARRANTY_MS, 'Replaced mixer cartridge and corroded angle valve under sink. No leaks after 10-min test.', s.gross, s.fee, s.reserve, s.net, a.id);
    ev(a.id, t0, 'Rachel Ng', 'Booked at fixed price S$65.00 · PayNow hold placed in escrow.');
    ev(a.id, t0 + 0.3 * H, 'Wei Ming Tan', 'Job accepted. Contractor verified (PUB simple plumbing scope).');
    ev(a.id, t0 + 2 * H, 'Wei Ming Tan', 'Checked in on site with geo-tagged Before photo.');
    ev(a.id, t0 + 2.2 * H, 'Wei Ming Tan', 'Logged on-site add-on: Corroded angle valve replacement (S$25.00).');
    ev(a.id, t0 + 2.25 * H, 'Rachel Ng', 'Approved add-on S$25.00 in app · added to escrow & warranty.');
    ev(a.id, t0 + 2.8 * H, 'Wei Ming Tan', 'Uploaded After photo. 24-hour auto-release countdown started.');
    ev(a.id, rel, 'Rachel Ng', `Customer marked the job as done. Payout released: S$${(s.net / 100).toFixed(2)} net to contractor. 30-day ChopeFix Protection is now active.`);

    // 2) In-progress electrical job, checked in, with a pending add-on awaiting customer approval
    const t1 = now - 3 * H;
    const b = book('CF-3HX9TD', '13A power socket replacement', farid, 'in_progress', '560415', '#11-27', sgDate(now), '12:00–15:00', 1, 'card', t1, 'Living room socket sparked when plugging in the vacuum. Have a replacement socket.');
    photo(b.id, 'CF-3HX9TD', b.trade, 'before', now - 25 * 60 * 1000, b.geo.lat, b.geo.lng);
    run("INSERT INTO addons (booking_id, label, price_cents, status, created_at) VALUES (?, 'Replacement switch plate (scorched)', 1800, 'pending', ?)", b.id, now - 8 * 60 * 1000);
    run('UPDATE bookings SET accepted_at=?, checked_in_at=? WHERE id=?', t1 + 0.4 * H, now - 25 * 60 * 1000, b.id);
    ev(b.id, t1, 'Rachel Ng', 'Booked at fixed price S$70.00 · card authorisation hold placed in escrow.');
    ev(b.id, t1 + 0.4 * H, 'Farid Rahman', 'Job accepted. EMA LEW licence verified.');
    ev(b.id, now - 25 * 60 * 1000, 'Farid Rahman', 'Checked in on site with geo-tagged Before photo.');
    ev(b.id, now - 8 * 60 * 1000, 'Farid Rahman', 'Logged on-site add-on: Replacement switch plate (scorched) (S$18.00) · awaiting customer approval.');

    // 3) Fresh request waiting in the Handyman feed
    const t2 = now - 40 * 60 * 1000;
    const c = book('CF-9LB2RW', 'TV wall mount (up to 65")', null, 'requested', '238877', '#15-03', sgDate(now + D), '18:00–21:00', 1, 'paynow', t2, '55" TV, bracket already bought. Concrete wall.');
    ev(c.id, t2, 'Rachel Ng', 'Booked at fixed price S$95.00 · PayNow hold placed in escrow. Broadcast to verified handymen nearby.');
  });
  return true;
}

/**
 * ChopeFix end-to-end API test.
 * Boots an isolated server (temp SQLite DB + temp uploads dir) and walks the full marketplace lifecycle.
 * Run: npm run test:e2e   (uses dist/server/index.js when built, otherwise server/index.ts)
 */
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'chopefix-e2e-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const entry = fs.existsSync(path.join(ROOT, 'dist/server/index.js')) ? 'dist/server/index.js' : 'server/index.ts';

let passed = 0;
const failures: string[] = [];
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  catch (e) { failures.push(name); console.log(`  \x1b[31m✗ ${name}\x1b[0m\n    ${(e as Error).message}`); throw e; }
}

/** Minimal cookie-jar client. */
class Client {
  cookie = '';
  async req(method: string, url: string, body?: unknown): Promise<{ status: number; data: any }> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    let payload: FormData | string | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const res = await fetch(BASE + url, { method, headers, body: payload });
    const set = res.headers.getSetCookie();
    for (const c of set) { const kv = c.split(';')[0]; if (kv.startsWith('cf_session=')) this.cookie = kv.endsWith('=') ? '' : kv; }
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, data };
  }
  get(u: string) { return this.req('GET', u); }
  post(u: string, b: unknown = {}) { return this.req('POST', u, b); }
  put(u: string, b: unknown = {}) { return this.req('PUT', u, b); }
}

/** Builds a real (tiny) PNG so multipart upload is exercised end to end. */
function pngBuffer(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const w = 8, h = 8;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = 20; raw[o + 1] = 184; raw[o + 2] = 166; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function photoForm(fields: Record<string, string>, withFile: boolean) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (withFile) fd.set('photo', new Blob([new Uint8Array(pngBuffer())], { type: 'image/png' }), 'site.png');
  else fd.set('sample', 'true');
  return fd;
}

async function main() {
  console.log(`\nChopeFix E2E · server ${entry} · port ${PORT} · tmp ${TMP}\n`);
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', entry], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(TMP, 'test.db'), UPLOAD_DIR: path.join(TMP, 'uploads'), DEMO_MODE: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d)); server.stderr.on('data', (d) => (log += d));
  const stop = () => { server.kill('SIGTERM'); fs.rmSync(TMP, { recursive: true, force: true }); };
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ } await new Promise((r) => setTimeout(r, 150)); }

    const anon = new Client(), cust = new Client(), wm = new Client(), jason = new Client(), admin = new Client();
    let bookingId = 0, addonId = 0, claimId = 0;

    console.log('Auth & session');
    await step('GET /api/health returns 200', async () => { const r = await anon.get('/api/health'); assert.equal(r.status, 200); assert.equal(r.data.ok, true); });
    await step('Seeded catalog has 11 standard jobs with compliance tags', async () => {
      const r = await anon.get('/api/catalog'); assert.equal(r.data.items.length, 11);
      assert.ok(r.data.items.filter((i: any) => i.trade === 'Electrical').every((i: any) => i.compliance === 'EMA LEW verified contractor'));
      assert.ok(r.data.items.filter((i: any) => i.trade === 'Plumbing').every((i: any) => i.compliance === 'PUB simple plumbing scope'));
    });
    await step('Unauthenticated booking list is rejected (401)', async () => { assert.equal((await anon.get('/api/bookings')).status, 401); });
    await step('Register new customer (scrypt hash) sets HTTP-only session cookie', async () => {
      const r = await cust.post('/api/auth/register', { name: 'Test Homeowner', email: 'e2e@example.sg', password: 'supersecret1', phone: '+65 8000 0001' });
      assert.equal(r.status, 201); assert.equal(r.data.user.role, 'customer'); assert.ok(cust.cookie.startsWith('cf_session='));
    });
    await step('Logout clears session; wrong password is rejected; correct login works', async () => {
      await cust.post('/api/auth/logout'); assert.equal((await cust.get('/api/auth/me')).data.user, null);
      assert.equal((await cust.post('/api/auth/login', { email: 'e2e@example.sg', password: 'nope-nope' })).status, 401);
      const r = await cust.post('/api/auth/login', { email: 'e2e@example.sg', password: 'supersecret1' }); assert.equal(r.status, 200); assert.equal(r.data.user.name, 'Test Homeowner');
    });
    await step('Demo contractor + admin can log in with password', async () => {
      for (const [c, email] of [[wm, 'weiming@chopefix.demo'], [jason, 'jason@chopefix.demo'], [admin, 'ops@chopefix.demo']] as const) {
        const r = await c.post('/api/auth/login', { email, password: 'chopefix123' }); assert.equal(r.status, 200, email);
      }
    });
    await step('Role guard: customer cannot read admin KPIs (403)', async () => { assert.equal((await cust.get('/api/admin/kpis')).status, 403); });

    console.log('\nBooking → held escrow');
    const catalog = (await anon.get('/api/catalog')).data.items;
    const tap = catalog.find((i: any) => i.title === 'Leaking tap / mixer repair');
    await step('Booking without payment authorisation is refused (402); bad postal code (400)', async () => {
      assert.equal((await cust.post('/api/bookings', { catalogId: tap.id, postalCode: '520231', unitNo: '#01-01', windowDate: '2026-11-21', windowSlot: '09:00–12:00', paymentRail: 'paynow' })).status, 402);
      assert.equal((await cust.post('/api/bookings', { catalogId: tap.id, postalCode: '12', unitNo: '#01-01', windowDate: '2026-11-21', windowSlot: '09:00–12:00', paymentRail: 'paynow', paymentAuthorized: true })).status, 400);
    });
    await step('Create booking (PayNow hold) → status requested, S$65 held', async () => {
      const r = await cust.post('/api/bookings', { catalogId: tap.id, postalCode: '520231', unitNo: '#08-112', windowDate: '2026-11-21', windowSlot: '09:00–12:00', hasPart: false, paymentRail: 'paynow', paymentAuthorized: true, notes: 'E2E test' });
      assert.equal(r.status, 201); bookingId = r.data.booking.id;
      assert.equal(r.data.booking.status, 'requested'); assert.equal(r.data.booking.amounts.gross, 6500); assert.match(r.data.booking.payment.ref, /^PN-/);
      assert.equal(r.data.booking.address.area, 'Tampines / Pasir Ris');
    });

    console.log('\nContractor workflow');
    await step('Plumber feed shows the job with masked address and net payout after 8% fee', async () => {
      const r = await wm.get('/api/contractor/feed'); const b = r.data.items.find((x: any) => x.id === bookingId);
      assert.ok(b); assert.equal(b.address.postalCode, '52xxxx'); assert.equal(b.address.unitNo, '');
      assert.equal(b.amounts.fee, 520); assert.equal(b.amounts.gross - b.amounts.fee, 5980);
    });
    await step('Handyman cannot accept a plumbing job (403)', async () => { assert.equal((await jason.post(`/api/contractor/bookings/${bookingId}/accept`)).status, 403); });
    await step('Plumber accepts → accepted; double-accept rejected (409)', async () => {
      const r = await wm.post(`/api/contractor/bookings/${bookingId}/accept`); assert.equal(r.status, 200); assert.equal(r.data.booking.status, 'accepted');
      assert.equal(r.data.booking.address.unitNo, '#08-112');
      assert.equal((await wm.post(`/api/contractor/bookings/${bookingId}/accept`)).status, 409);
    });
    await step('Completion before check-in is blocked (409)', async () => { assert.equal((await wm.post(`/api/contractor/bookings/${bookingId}/complete`, photoForm({}, false))).status, 409); });
    await step('Check-in with REAL multipart PNG + GPS → in_progress, photo served from /uploads', async () => {
      const r = await wm.post(`/api/contractor/bookings/${bookingId}/check-in`, photoForm({ lat: '1.35401', lng: '103.94402' }, true));
      assert.equal(r.status, 200, JSON.stringify(r.data)); assert.equal(r.data.booking.status, 'in_progress');
      const p = r.data.booking.photos[0]; assert.equal(p.kind, 'before'); assert.equal(p.lat, 1.35401); assert.equal(p.isSample, false); assert.match(p.url, /^\/uploads\/photo-.*\.png$/);
      const img = await fetch(BASE + p.url); assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
    });
    await step('Log on-site add-on (corroded angle valve S$25) → pending', async () => {
      const r = await wm.post(`/api/contractor/bookings/${bookingId}/addons`, { label: 'Corroded angle valve', price: 25 });
      assert.equal(r.status, 201); const a = r.data.booking.addons[0]; addonId = a.id; assert.equal(a.status, 'pending'); assert.equal(a.price, 2500);
    });
    await step('Completion blocked while add-on awaits customer (409)', async () => { assert.equal((await wm.post(`/api/contractor/bookings/${bookingId}/complete`, photoForm({}, false))).status, 409); });
    await step('Customer approves add-on → escrow grows to S$90', async () => {
      const r = await cust.post(`/api/bookings/${bookingId}/addons/${addonId}/decision`, { approve: true });
      assert.equal(r.status, 200); assert.equal(r.data.booking.addons[0].status, 'approved'); assert.equal(r.data.booking.amounts.gross, 9000);
    });
    await step('Upload After photo (sample) + note → awaiting_confirmation with 24h auto-release', async () => {
      const r = await wm.post(`/api/contractor/bookings/${bookingId}/complete`, photoForm({ note: 'Replaced cartridge + angle valve' }, false));
      assert.equal(r.status, 200); const b = r.data.booking; assert.equal(b.status, 'awaiting_confirmation');
      const hrs = (b.autoReleaseAt - b.completedAt) / 3600000; assert.equal(hrs, 24);
      const after = b.photos.find((p: any) => p.kind === 'after'); assert.ok(after.isSample); assert.equal((await fetch(BASE + after.url)).status, 200);
    });

    console.log('\nRelease & ledger');
    await step('Simulate 24h expiry → auto-released: gross 9000, fee 720 (8%), reserve 450 (5%), net 7830', async () => {
      const r = await cust.post(`/api/bookings/${bookingId}/simulate-auto-release`);
      assert.equal(r.status, 200); const b = r.data.booking;
      assert.equal(b.status, 'completed'); assert.equal(b.releaseType, 'auto');
      assert.deepEqual([b.amounts.gross, b.amounts.fee, b.amounts.reserve, b.amounts.net], [9000, 720, 450, 7830]);
      assert.equal(Math.round((b.warrantyUntil - b.releasedAt) / 86400000), 30); assert.equal(b.warrantyActive, true);
    });
    await step('Second job: customer taps "Mark job as done" for early release', async () => {
      const r1 = await cust.post('/api/bookings', { catalogId: tap.id, postalCode: '310123', unitNo: '#02-02', windowDate: '2026-11-22', windowSlot: '12:00–15:00', paymentRail: 'card', paymentAuthorized: true });
      const id = r1.data.booking.id; assert.match(r1.data.booking.payment.ref, /^AUTH-/);
      await wm.post(`/api/contractor/bookings/${id}/accept`);
      await wm.post(`/api/contractor/bookings/${id}/check-in`, photoForm({}, false));
      await wm.post(`/api/contractor/bookings/${id}/complete`, photoForm({}, false));
      const r = await cust.post(`/api/bookings/${id}/mark-done`); assert.equal(r.data.booking.status, 'completed'); assert.equal(r.data.booking.releaseType, 'customer');
      assert.equal(r.data.booking.amounts.net, 6500 - 520 - 325);
    });
    await step('Contractor ledger: released gross/fees/reserve/net reconcile', async () => {
      const r = await wm.get('/api/contractor/ledger'); const t = r.data.totals;
      // seed booking (S$90 gross) + two e2e jobs (S$90 + S$65)
      assert.equal(t.grossReleased, 9000 + 9000 + 6500);
      assert.equal(t.fees, 720 + 720 + 520);
      assert.equal(t.reserveHeld, 450 + 450 + 325);
      assert.equal(t.netReleased, t.grossReleased - t.fees - t.reserveHeld);
    });

    console.log('\nWarranty rework loop');
    await step('Customer files warranty claim → rework ticket dispatched; duplicate open claim refused', async () => {
      const r = await cust.post(`/api/bookings/${bookingId}/claims`, { issue: 'Tap dripping again from the base' }); assert.equal(r.status, 201); claimId = r.data.claimId;
      assert.equal((await cust.post(`/api/bookings/${bookingId}/claims`, { issue: 'again' })).status, 409);
    });
    await step('Contractor sees ticket and resolves it with fresh REAL photo proof', async () => {
      const list = await wm.get('/api/contractor/claims'); assert.ok(list.data.items.some((c: any) => c.id === claimId && c.status === 'open'));
      const r = await wm.post(`/api/contractor/claims/${claimId}/resolve`, photoForm({ note: 'Re-seated cartridge, new O-ring' }, true));
      assert.equal(r.status, 200); const b = r.data.booking;
      assert.equal(b.claims[0].status, 'resolved'); assert.ok(b.photos.some((p: any) => p.kind === 'rework' && p.claimId === claimId));
    });

    console.log('\nDisputes & ops');
    let disputeBooking = 0;
    await step('Customer reports issue during confirmation window → payout paused (disputed)', async () => {
      const r1 = await cust.post('/api/bookings', { catalogId: tap.id, postalCode: '560415', unitNo: '#05-05', windowDate: '2026-11-23', windowSlot: '15:00–18:00', paymentRail: 'paynow', paymentAuthorized: true });
      disputeBooking = r1.data.booking.id;
      await wm.post(`/api/contractor/bookings/${disputeBooking}/accept`);
      await wm.post(`/api/contractor/bookings/${disputeBooking}/check-in`, photoForm({}, false));
      await wm.post(`/api/contractor/bookings/${disputeBooking}/complete`, photoForm({}, false));
      const r = await cust.post(`/api/bookings/${disputeBooking}/report-issue`, { reason: 'Quality / still faulty', details: 'Still leaking' });
      assert.equal(r.data.booking.status, 'disputed'); assert.equal(r.data.booking.autoReleaseAt, null);
      assert.equal((await cust.post(`/api/bookings/${disputeBooking}/simulate-auto-release`)).status, 409);
    });
    await step('Ops KPIs computed from SQLite reflect GMV, escrow, fees, disputes, warranties', async () => {
      const k = (await admin.get('/api/admin/kpis')).data.kpis;
      assert.equal(k.openDisputes, 1); assert.ok(k.feesEarned >= 720 * 2 + 520); assert.ok(k.activeWarranties >= 3); assert.ok(k.escrowHeld >= 6500);
    });
    await step('Ops resolves dispute with refund → booking refunded, contractor nets S$0', async () => {
      const q = (await admin.get('/api/admin/queue')).data; const d = q.disputes.find((x: any) => x.booking.id === disputeBooking);
      const r = await admin.post(`/api/admin/disputes/${d.id}/resolve`, { action: 'refund', note: 'Photos show leak persists' });
      assert.equal(r.data.booking.status, 'refunded'); assert.equal(r.data.booking.amounts.net, 0);
      assert.equal((await admin.get('/api/admin/kpis')).data.kpis.openDisputes, 0);
    });
    await step('Ops updates a catalog price + adds a new standard job live', async () => {
      const u = await admin.put(`/api/admin/catalog/${tap.id}`, { price: 68 }); assert.equal(u.data.item.price, 6800);
      const c = await admin.post('/api/admin/catalog', { trade: 'Handyman', title: 'Door closer adjustment', summary: 'Adjust a sagging door closer.', scope: ['Adjust closer speed', 'Tighten hinges'], durationMin: 30, price: 55 });
      assert.equal(c.status, 201); assert.equal((await anon.get('/api/catalog')).data.items.length, 12);
    });
  } finally {
    stop();
  }
  console.log(`\n\x1b[1m${passed} passed, ${failures.length} failed\x1b[0m`);
  if (failures.length) { console.log(log.slice(-2000)); process.exit(1); }
}

main().catch((e) => { console.error(`\nE2E aborted: ${(e as Error).message}`); process.exit(1); });

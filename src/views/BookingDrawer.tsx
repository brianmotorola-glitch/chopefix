import { useMemo, useState } from 'react';
import { api } from '../api';
import type { Booking, CatalogItem, Settings, User } from '../types';
import { sgd, pct, sgToday, fmtWindowDate } from '../format';
import { Button, ComplianceBadge, Drawer, Field, Icon, TradeChip, cx, inputCls, useToast } from '../components/ui';

const SLOTS = ['ASAP (within 2 hrs)', '09:00–12:00', '12:00–15:00', '15:00–18:00', '18:00–21:00'];

export function BookingDrawer({ item, user, settings, onClose, onBooked }: { item: CatalogItem; user: User; settings: Settings; onClose: () => void; onBooked: (b: Booking) => void }) {
  const [f, setF] = useState({ postalCode: '', unitNo: '', windowDate: sgToday(), windowSlot: '18:00–21:00', hasPart: false, notes: '', paymentRail: 'paynow' as 'paynow' | 'card' });
  const [stage, setStage] = useState<'form' | 'pay'>('form');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toast = useToast();
  const dates = [0, 1, 2, 3].map((d) => sgToday(d));
  const postalOk = /^\d{6}$/.test(f.postalCode);
  const formOk = postalOk && f.unitNo.trim().length > 0;
  const fee = Math.round((item.price * settings.feeBps) / 10000);
  const reserve = Math.round((item.price * settings.reserveBps) / 10000);
  const qrRef = useMemo(() => `CHOPEFIX${item.id}${Date.now().toString(36).toUpperCase()}`, [item.id]);

  const confirm = async () => {
    setBusy(true); setErr('');
    try {
      if (f.paymentRail === 'card') await new Promise((r) => setTimeout(r, 900)); // simulated 3DS / authorisation round-trip
      const r = await api.post<{ booking: Booking }>('/api/bookings', { catalogId: item.id, ...f, paymentAuthorized: true, cardLast4: '4242' });
      toast(`Booked ${r.booking.ref} · ${sgd(item.price)} held in escrow`);
      onBooked(r.booking);
    } catch (e) { setErr((e as Error).message); setStage('form'); } finally { setBusy(false); }
  };

  const summary = (
    <div className="space-y-2 text-sm">
      <Row label="Fixed job price" value={sgd(item.price)} />
      <Row label="On-site add-ons" value="Only if you approve in app" muted />
      <Row label="Booking / platform fee" value="S$0.00" muted />
      <div className="my-2 border-t border-dashed border-slate-300" />
      <Row label={<span className="flex items-center gap-1.5 font-bold text-ink"><Icon.Lock className="h-4 w-4 text-teal-600" />Held in escrow today</span>} value={<span className="text-lg font-extrabold text-ink">{sgd(item.price)}</span>} />
      <p className="text-xs leading-relaxed text-slate-500">Released to {item.trade === 'Electrical' ? 'your LEW' : 'your pro'} only after you tap <b>Mark job as done</b>, or automatically {settings.autoReleaseHours}h after the After photo is uploaded. Contractor receives {sgd(item.price - fee - reserve)} after the {pct(settings.feeBps)} ChopeFix fee and {pct(settings.reserveBps)} warranty reserve.</p>
    </div>
  );

  return (
    <Drawer open onClose={onClose} title={<span className="flex items-center gap-2">Chope this job <span className="text-slate-400">·</span> <span className="tabular">{sgd(item.price, 0)}</span></span>}
      footer={stage === 'form' ? (
        <div className="flex items-center gap-3">
          <div className="flex-1"><div className="text-xs text-slate-500">Held now</div><div className="tabular text-xl font-extrabold text-ink">{sgd(item.price)}</div></div>
          <Button size="lg" variant="accent" disabled={!formOk} onClick={() => setStage('pay')}>Continue to {f.paymentRail === 'paynow' ? 'PayNow' : 'card'}</Button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Button variant="secondary" size="lg" onClick={() => setStage('form')} disabled={busy}>Back</Button>
          <Button size="lg" className="flex-1" variant="success" loading={busy} onClick={confirm}>
            {f.paymentRail === 'paynow' ? 'I’ve paid · confirm booking (simulated)' : `Authorise ${sgd(item.price)} hold (simulated)`}
          </Button>
        </div>
      )}>
      <div className="mb-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between"><TradeChip trade={item.trade} /><span className="text-xs font-semibold text-slate-500">~{item.durationMin} min · single visit</span></div>
        <div className="mt-2 text-base font-bold text-ink">{item.title}</div>
        <ul className="mt-2 grid gap-1">{item.scope.map((s) => <li key={s} className="flex gap-2 text-[13px] text-slate-600"><Icon.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />{s}</li>)}</ul>
        {item.exclusions.length > 0 && <p className="mt-2 text-xs text-slate-500"><b>Not included:</b> {item.exclusions.join(' · ')}</p>}
        <div className="mt-3"><ComplianceBadge text={item.compliance} /></div>
      </div>

      {stage === 'form' ? (
        <div className="space-y-5">
          <div className="grid grid-cols-[1.2fr_1fr] gap-3">
            <Field label="Postal code" hint={f.postalCode && !postalOk ? <span className="text-rose-600">6 digits, e.g. 520231</span> : 'Singapore only'}>
              <input className={inputCls} inputMode="numeric" maxLength={6} placeholder="520231" value={f.postalCode} onChange={(e) => setF({ ...f, postalCode: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Unit no."><input className={inputCls} placeholder="#08-112" value={f.unitNo} onChange={(e) => setF({ ...f, unitNo: e.target.value })} /></Field>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate-700">Arrival date</div>
            <div className="grid grid-cols-4 gap-2">
              {dates.map((d) => <Chip key={d} on={f.windowDate === d} onClick={() => setF({ ...f, windowDate: d })}>{fmtWindowDate(d)}</Chip>)}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate-700">Arrival window</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SLOTS.map((s) => <Chip key={s} on={f.windowSlot === s} onClick={() => setF({ ...f, windowSlot: s })}>{s}</Chip>)}
            </div>
          </div>
          <button type="button" onClick={() => setF({ ...f, hasPart: !f.hasPart })} className="flex w-full items-center justify-between gap-4 rounded-2xl p-3.5 text-left ring-1 ring-slate-200 hover:bg-slate-50">
            <div>
              <div className="text-sm font-semibold text-ink">I have the replacement part</div>
              <div className="text-xs text-slate-500">{f.hasPart ? 'Pro will install your part. No parts add-on expected.' : 'Pro brings a standard part if needed, logged as an in-app add-on for your approval.'}</div>
            </div>
            <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition', f.hasPart ? 'bg-teal-500' : 'bg-slate-300')}><span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', f.hasPart ? 'left-[22px]' : 'left-0.5')} /></span>
          </button>
          <Field label="Notes for the pro (optional)"><textarea className={cx(inputCls, 'min-h-[70px]')} placeholder="e.g. Kitchen tap, water dripping constantly. Lift lobby B." value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <div>
            <div className="mb-1.5 text-[13px] font-semibold text-slate-700">Pay with</div>
            <div className="grid grid-cols-2 gap-2">
              {([['paynow', 'PayNow QR', 'Instant · lowest fees'], ['card', 'Card', 'Visa / Mastercard hold']] as const).map(([v, t, d]) => (
                <button key={v} type="button" onClick={() => setF({ ...f, paymentRail: v })} className={cx('rounded-2xl p-3.5 text-left ring-1 transition', f.paymentRail === v ? 'bg-teal-50 ring-2 ring-teal-500' : 'ring-slate-200 hover:bg-slate-50')}>
                  <div className="flex items-center gap-2 text-sm font-bold text-ink">{v === 'paynow' ? <span className="rounded bg-[#7c1a78] px-1.5 py-0.5 text-[10px] font-extrabold text-white">PayNow</span> : <Icon.Wallet className="h-4 w-4" />}{t}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{d}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">{summary}</div>
          {err && <p className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{err}</p>}
          <p className="text-xs text-slate-500">Booking as <b>{user.name}</b>. Card numbers are never collected in this MVP; payments are simulated holds.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {f.paymentRail === 'paynow' ? (
            <div className="flex flex-col items-center rounded-2xl bg-white p-5 text-center ring-1 ring-slate-200">
              <span className="rounded bg-[#7c1a78] px-2 py-1 text-xs font-extrabold text-white">PayNow</span>
              <FakeQr seed={qrRef} />
              <div className="text-sm font-semibold text-ink">Scan to pay {sgd(item.price)} to ChopeFix Escrow</div>
              <div className="mt-1 font-mono text-xs text-slate-500">UEN 2026XXXXXK · Ref {qrRef.slice(0, 18)}</div>
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">SIMULATED QR · do not scan · no money moves</div>
            </div>
          ) : (
            <div className="rounded-2xl bg-gradient-to-br from-ink to-teal-800 p-5 text-white shadow-lg">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-teal-200"><span>Test card on file</span><span>VISA</span></div>
              <div className="mt-6 font-mono text-lg tracking-[0.2em]">•••• •••• •••• 4242</div>
              <div className="mt-4 flex justify-between text-xs text-teal-100"><span>{user.name.toUpperCase()}</span><span>Hold only · not captured</span></div>
            </div>
          )}
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="mb-2 text-sm font-bold text-ink">{f.postalCode} · {f.unitNo} · {fmtWindowDate(f.windowDate)}, {f.windowSlot}</div>
            {summary}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Row({ label, value, muted }: { label: React.ReactNode; value: React.ReactNode; muted?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><span className={muted ? 'text-slate-500' : 'text-slate-700'}>{label}</span><span className={cx('tabular font-semibold', muted ? 'text-slate-500' : 'text-ink')}>{value}</span></div>;
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={cx('rounded-xl px-2 py-2.5 text-[13px] font-semibold ring-1 transition', on ? 'bg-ink text-white ring-ink' : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300')}>{children}</button>;
}

/** Deterministic QR-looking pattern (decorative only). */
function FakeQr({ seed }: { seed: string }) {
  const n = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const cells: [number, number][] = [];
  const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    h = Math.imul(h ^ (x * 31 + y), 16777619);
    if (!inFinder(x, y) && (h >>> 0) % 100 < 47) cells.push([x, y]);
  }
  const finder = (x: number, y: number) => <g key={`${x}${y}`}><rect x={x} y={y} width="7" height="7" fill="#0f172a" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#0f172a" /></g>;
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} className="my-4 h-48 w-48" shapeRendering="crispEdges">
      <rect x="-1" y="-1" width={n + 2} height={n + 2} fill="#fff" />
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0f172a" />)}
      {finder(0, 0)}{finder(n - 7, 0)}{finder(0, n - 7)}
      <rect x={n / 2 - 3} y={n / 2 - 2} width="6" height="4" rx="0.6" fill="#7c1a78" />
    </svg>
  );
}

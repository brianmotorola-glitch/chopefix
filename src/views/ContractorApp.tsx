import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Booking, DemoAccount, Settings, User } from '../types';
import { sgd, pct, fmtDateTime, fmtWindowDate, fmtDate, relTime } from '../format';
import { Avatar, Badge, Button, Card, Countdown, Empty, Field, Icon, Segmented, StatusBadge, TradeChip, cx, inputCls, useToast } from '../components/ui';
import { PaymentSummary, PhotoGallery, Section, Timeline } from '../components/booking';

type Tab = 'feed' | 'active' | 'rework' | 'earnings';
type ClaimItem = { id: number; issue: string; status: 'open' | 'resolved'; contractorNote: string | null; createdAt: number; resolvedAt: number | null; booking: Booking };
type Ledger = { totals: Record<'heldEscrow' | 'heldNet' | 'grossReleased' | 'fees' | 'reserveHeld' | 'reserveReleased' | 'netReleased' | 'jobsReleased' | 'refunded', number>; entries: Array<{ id: number; ref: string; jobTitle: string; status: Booking['status']; at: number; releaseType: string | null; warrantyUntil: number | null; gross: number; fee: number; reserve: number; net: number }> };

const PRESETS: Record<string, Array<[string, number]>> = {
  Plumbing: [['Corroded angle valve', 25], ['Silicone sealant re-seal', 15], ['Flexible hose (standard)', 12], ['Tap cartridge (standard)', 22]],
  Electrical: [['Replacement switch plate', 18], ['13A socket (standard)', 16], ['LED downlight (each)', 14], ['Junction box', 12]],
  Handyman: [['Silicone sealant', 15], ['Wall plugs & screws kit', 8], ['Cable trunking (1 m)', 10], ['Extra bracket / anchor', 12]],
};

function getGeo(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    const t = setTimeout(() => resolve({}), 2500);
    navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); }, () => { clearTimeout(t); resolve({}); }, { timeout: 2500, maximumAge: 60000 });
  });
}

export function ContractorApp({ user, settings, demoContractors, onSwitch }: { user: User; settings: Settings; demoContractors: DemoAccount[]; onSwitch: (email: string) => void }) {
  const [tab, setTab] = useState<Tab>('active');
  const [feed, setFeed] = useState<{ verified: boolean; items: Booking[] }>({ verified: true, items: [] });
  const [mine, setMine] = useState<Booking[]>([]);
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const [f, m, c, l] = await Promise.all([
      api.get<{ verified: boolean; items: Booking[] }>('/api/contractor/feed'),
      api.get<{ items: Booking[] }>('/api/bookings'),
      api.get<{ items: ClaimItem[] }>('/api/contractor/claims'),
      api.get<Ledger>('/api/contractor/ledger'),
    ]);
    setFeed(f); setMine(m.items); setClaims(c.items); setLedger(l);
    return { f, m };
  }, []);
  useEffect(() => {
    load().then(({ f, m }) => {
      const act = m.items.filter((b) => ['accepted', 'in_progress', 'awaiting_confirmation', 'disputed'].includes(b.status));
      if (!act.length && f.items.length) setTab('feed');
      setSel(act[0]?.id ?? null);
    });
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const active = mine.filter((b) => ['accepted', 'in_progress', 'awaiting_confirmation', 'disputed'].includes(b.status));
  const openClaims = claims.filter((c) => c.status === 'open');
  const current = active.find((b) => b.id === sel) ?? active[0] ?? null;
  const update = (b: Booking) => { setMine((xs) => (xs.some((x) => x.id === b.id) ? xs.map((x) => (x.id === b.id ? b : x)) : [b, ...xs])); load(); };

  const accept = async (b: Booking) => {
    try {
      const r = await api.post<{ booking: Booking }>(`/api/contractor/bookings/${b.id}/accept`);
      toast(`Chope-d! ${r.booking.ref} is yours`);
      update(r.booking); setSel(r.booking.id); setTab('active');
    } catch (e) { toast((e as Error).message, 'err'); load(); }
  };

  return (
    <div className="space-y-6">
      {demoContractors.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {demoContractors.map((c) => (
            <button key={c.email} onClick={() => c.email !== user.email && onSwitch(c.email)}
              className={cx('flex shrink-0 items-center gap-2.5 rounded-2xl py-2 pl-2 pr-4 text-left ring-1 transition', c.email === user.email ? 'bg-white shadow-md ring-2 ring-teal-500' : 'bg-white/60 ring-slate-200 hover:bg-white')}>
              <Avatar initials={c.name.split(' ').map((p) => p[0]).join('').slice(0, 2)} trade={c.trade ?? undefined} size="sm" />
              <div><div className="text-sm font-bold text-ink">{c.name}</div><div className="text-[11px] text-slate-500">{c.trade} · {c.trade === 'Electrical' ? 'EMA LEW' : c.trade === 'Plumbing' ? 'PUB scope' : 'Vetted'}</div></div>
            </button>
          ))}
        </div>
      )}

      <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-teal-500/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Avatar initials={user.contractor!.initials} trade={user.contractor!.trade} size="lg" verified={user.contractor!.verified} />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-teal-300">Pro Partner · {user.contractor!.trade}</div>
              <div className="text-2xl font-extrabold tracking-tight">Hi {user.name.split(' ')[0]}, zero quoting today.</div>
              <div className="mt-1 text-sm text-slate-300">{user.contractor!.licenceType} · {user.contractor!.licenceNo} {user.contractor!.verified ? '· verified' : '· verification pending'}</div>
            </div>
          </div>
          {ledger && (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Held for you" value={sgd(ledger.totals.heldNet, 0)} />
              <Stat label="Paid out" value={sgd(ledger.totals.netReleased, 0)} />
              <Stat label="Reserve (30d)" value={sgd(ledger.totals.reserveHeld, 0)} />
            </div>
          )}
        </div>
      </section>

      <Segmented value={tab} onChange={setTab} className="max-w-full overflow-x-auto scrollbar-none" options={[
        { value: 'feed', label: <>Available jobs <Count n={feed.items.length} /></> },
        { value: 'active', label: <>Active jobs <Count n={active.length} /></> },
        { value: 'rework', label: <>Rework tickets <Count n={openClaims.length} hot /></> },
        { value: 'earnings', label: 'Earnings & reserve' },
      ]} />

      {tab === 'feed' && (
        <div className="space-y-4">
          {!feed.verified && <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">Your licence/ID verification is pending. You can browse jobs, and Ops will verify you before you can accept.</div>}
          {feed.items.length === 0 ? <Empty icon={<Icon.Bolt className="h-8 w-8" />} title={`No open ${user.contractor!.trade.toLowerCase()} jobs right now`}>New fixed-price jobs appear here instantly. Tip: book one as the demo customer to see it land.</Empty> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {feed.items.map((b) => {
                const keep = b.amounts.gross - b.amounts.fee;
                return (
                  <Card key={b.id} className="flex flex-col p-5">
                    <div className="flex items-center justify-between"><TradeChip trade={b.trade} /><span className="text-xs text-slate-400">posted {relTime(b.createdAt)}</span></div>
                    <h3 className="mt-3 text-[17px] font-bold text-ink">{b.jobTitle}</h3>
                    <div className="mt-2 space-y-1 text-[13px] text-slate-600">
                      <div className="flex items-center gap-1.5"><Icon.Pin className="h-4 w-4 text-slate-400" />{b.address.area} · S({b.address.postalCode})</div>
                      <div className="flex items-center gap-1.5"><Icon.Clock className="h-4 w-4 text-slate-400" />{fmtWindowDate(b.windowDate)}, {b.windowSlot} · ~{b.job?.durationMin} min</div>
                      <div className="flex items-center gap-1.5"><Icon.Wrench className="h-4 w-4 text-slate-400" />{b.hasPart ? 'Customer has the part' : 'Bring standard part (log as add-on)'}</div>
                    </div>
                    {b.notes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs italic text-slate-600">“{b.notes}”</p>}
                    <div className="mt-4 rounded-2xl bg-teal-50 p-3.5 ring-1 ring-teal-100">
                      <div className="flex items-end justify-between">
                        <div><div className="text-[11px] font-bold uppercase tracking-wide text-teal-700">Your payout after {pct(b.amounts.feeBps)} fee</div><div className="tabular text-2xl font-extrabold text-ink">{sgd(keep)}</div></div>
                        <div className="text-right text-xs text-slate-500">Job price {sgd(b.amounts.gross)}<br />Fee −{sgd(b.amounts.fee)}</div>
                      </div>
                      <div className="mt-1.5 text-[11.5px] text-teal-800">{sgd(b.amounts.net)} on release + {sgd(b.amounts.reserve)} ({pct(b.amounts.reserveBps)}) reserve returned after the 30-day warranty. Payment already held, no quoting.</div>
                    </div>
                    <Button className="mt-4 w-full" variant="accent" size="lg" disabled={!feed.verified} onClick={() => accept(b)}>Accept job</Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'active' && (active.length === 0 ? <Empty icon={<Icon.Wrench className="h-8 w-8" />} title="No active jobs">Accept a fixed-price job from the Available feed.</Empty> : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2.5">
            {active.map((b) => (
              <button key={b.id} onClick={() => setSel(b.id)} className={cx('w-full rounded-2xl bg-white p-4 text-left ring-1', current?.id === b.id ? 'ring-2 ring-teal-500 shadow-md' : 'ring-slate-200 hover:ring-slate-300')}>
                <div className="text-sm font-bold text-ink">{b.jobTitle}</div>
                <div className="text-xs text-slate-500">{b.ref} · {b.customer.name} · {b.address.area}</div>
                <div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge status={b.status} />{b.addons.some((a) => a.status === 'pending') && <Badge tone="amber">Add-on pending</Badge>}</div>
              </button>
            ))}
          </div>
          {current && <ActiveJob key={current.id} b={current} settings={settings} onChange={update} />}
        </div>
      ))}

      {tab === 'rework' && <ReworkTab claims={claims} onDone={load} />}
      {tab === 'earnings' && ledger && <Earnings ledger={ledger} settings={settings} />}
    </div>
  );
}

function Count({ n, hot }: { n: number; hot?: boolean }) {
  return <span className={cx('ml-1 rounded-full px-1.5 text-[11px]', n && hot ? 'bg-amber-500 text-ink' : 'bg-slate-200 text-slate-600')}>{n}</span>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-white/[.07] px-4 py-3 ring-1 ring-white/10"><div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div><div className="tabular text-xl font-extrabold">{value}</div></div>;
}

/* ------------------------------- photo input ------------------------------ */
function PhotoCapture({ label, cta, extra, onSubmit, disabled }: { label: string; cta: string; extra?: React.ReactNode; onSubmit: (fd: FormData) => Promise<void>; disabled?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<'file' | 'sample' | null>(null);
  const go = async (sample: boolean) => {
    setBusy(sample ? 'sample' : 'file');
    const fd = new FormData();
    const g = await getGeo();
    if (g.lat != null) { fd.set('lat', String(g.lat)); fd.set('lng', String(g.lng)); }
    if (sample) fd.set('sample', 'true'); else if (file) fd.set('photo', file);
    try { await onSubmit(fd); setFile(null); setPreview(null); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-ink">{label}</div>
      <label className={cx('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition', preview ? 'border-teal-400 bg-teal-50/50' : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50')}>
        {preview ? <img src={preview} alt="preview" className="max-h-44 rounded-xl" /> : <><Icon.Camera className="h-7 w-7 text-slate-400" /><span className="text-sm font-semibold text-slate-700">Take or upload a photo</span><span className="text-xs text-slate-500">JPEG / PNG / HEIC up to 10 MB · GPS & time stamped on upload</span></>}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); setPreview(f ? URL.createObjectURL(f) : null); }} />
      </label>
      {extra}
      <div className="flex flex-wrap gap-2">
        <Button variant="success" disabled={!file || disabled} loading={busy === 'file'} onClick={() => go(false)}><Icon.Upload className="h-4 w-4" />{cta}</Button>
        <Button variant="secondary" disabled={disabled} loading={busy === 'sample'} onClick={() => go(true)}><Icon.Sparkle className="h-4 w-4" />Use sample photo (demo)</Button>
      </div>
    </div>
  );
}

/* -------------------------------- active job ------------------------------ */
function ActiveJob({ b, settings, onChange }: { b: Booking; settings: Settings; onChange: (b: Booking) => void }) {
  const toast = useToast();
  const [addon, setAddon] = useState({ label: '', price: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = b.addons.some((a) => a.status === 'pending');

  const post = async (url: string, body: unknown, msg: string) => {
    try { const r = await api.post<{ booking: Booking }>(url, body); onChange(r.booking); toast(msg); }
    catch (e) { toast((e as Error).message, 'err'); throw e; }
  };
  const logAddon = async (label: string, price: number) => {
    setBusy(true);
    try { await post(`/api/contractor/bookings/${b.id}/addons`, { label, price }, `Sent “${label}” to customer for approval`); setAddon({ label: '', price: '' }); } catch { /* toasted */ } finally { setBusy(false); }
  };
  const steps = [
    { k: 'accepted', t: 'Check in + Before photo' },
    { k: 'in_progress', t: 'Log add-ons & complete' },
    { k: 'awaiting_confirmation', t: 'Auto-release timer' },
  ];
  const idx = steps.findIndex((s) => s.k === b.status);

  return (
    <div className="animate-rise space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><TradeChip trade={b.trade} /><span className="font-mono text-xs text-slate-400">{b.ref}</span></div>
            <h2 className="mt-2 text-xl font-extrabold text-ink">{b.jobTitle}</h2>
            <div className="mt-1 text-sm text-slate-600">{b.customer.name} · {b.customer.phone} · {b.address.unitNo}, S({b.address.postalCode}) {b.address.area}</div>
            <div className="text-sm text-slate-500">{fmtWindowDate(b.windowDate)}, {b.windowSlot} · {b.hasPart ? 'Customer has part' : 'Bring standard part'}</div>
          </div>
          <StatusBadge status={b.status} />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {steps.map((s, i) => (
            <div key={s.k} className={cx('rounded-xl px-3 py-2 text-[12.5px] font-semibold', i < idx ? 'bg-teal-50 text-teal-800' : i === idx ? 'bg-amber-100 text-ink ring-1 ring-amber-300' : 'bg-slate-50 text-slate-400')}>
              <span className="mr-1">{i < idx ? '✓' : i + 1}.</span>{s.t}
            </div>
          ))}
        </div>

        <div className="mt-5">
          {b.status === 'accepted' && (
            <PhotoCapture label="On arrival: snap a Before photo to check in" cta="Check in with photo"
              onSubmit={(fd) => post(`/api/contractor/bookings/${b.id}/check-in`, fd, 'Checked in · Before photo saved')} />
          )}
          {b.status === 'in_progress' && (
            <div className="grid gap-6 xl:grid-cols-2">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-ink">Need an extra part or small add-on?</div>
                <div className="flex flex-wrap gap-2">
                  {(PRESETS[b.trade] ?? PRESETS.Handyman).map(([l, p]) => (
                    <button key={l} disabled={busy} onClick={() => logAddon(l, p)} className="rounded-xl bg-white px-3 py-2 text-left text-[13px] font-semibold text-ink ring-1 ring-slate-200 hover:ring-amber-400 disabled:opacity-50">{l} <span className="text-amber-600">S${p}</span></button>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_100px_auto] gap-2">
                  <input className={inputCls} placeholder="Custom item" value={addon.label} onChange={(e) => setAddon({ ...addon, label: e.target.value })} />
                  <input className={inputCls} placeholder="S$" inputMode="decimal" value={addon.price} onChange={(e) => setAddon({ ...addon, price: e.target.value.replace(/[^\d.]/g, '') })} />
                  <Button variant="primary" disabled={!addon.label || !Number(addon.price) || busy} onClick={() => logAddon(addon.label, Number(addon.price))}>Log</Button>
                </div>
                {b.addons.length > 0 && (
                  <div className="space-y-1.5">
                    {b.addons.map((a) => <div key={a.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>{a.label} · <b className="tabular">{sgd(a.price)}</b></span><Badge tone={a.status === 'approved' ? 'emerald' : a.status === 'pending' ? 'amber' : 'slate'} dot>{a.status === 'pending' ? 'Waiting for customer' : a.status}</Badge></div>)}
                  </div>
                )}
                <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Log every extra in the app: approved add-ons are paid through escrow and covered by ChopeFix Protection. Cash extras aren’t covered and can’t be defended in a dispute.</p>
              </div>
              <PhotoCapture label="Done? Upload the After photo to start the 24h release timer" cta="Submit completion" disabled={pending}
                extra={<>
                  <Field label="Completion note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replaced cartridge, leak tested 10 min." /></Field>
                  {pending && <p className="text-xs font-semibold text-amber-700">Waiting for the customer to approve or decline the pending add-on.</p>}
                </>}
                onSubmit={async (fd) => { fd.set('note', note); await post(`/api/contractor/bookings/${b.id}/complete`, fd, 'Completion submitted · 24h auto-release started'); }} />
            </div>
          )}
          {b.status === 'awaiting_confirmation' && b.autoReleaseAt && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-br from-teal-600 to-ink p-5 text-white">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-teal-200">Waiting for customer · auto-release</div>
                <Countdown until={b.autoReleaseAt} className="text-3xl font-bold" />
                <div className="text-sm text-teal-100">{sgd(b.amounts.net)} releases to you at {fmtDateTime(b.autoReleaseAt)} SGT, or earlier when the customer confirms.</div>
              </div>
              {settings.demoMode && <Button variant="accent" onClick={() => post(`/api/bookings/${b.id}/simulate-auto-release`, {}, 'Demo: 24h elapsed · payout released')}><Icon.Clock className="h-4 w-4" />Simulate 24h auto-release</Button>}
            </div>
          )}
          {b.status === 'disputed' && <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200"><b>Payout paused.</b> Customer reported: “{b.dispute?.reason}”{b.dispute?.details ? ` (${b.dispute.details})` : ''}. ChopeFix Ops will review your photo proof.</div>}
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          <Section title="Photo proof"><PhotoGallery booking={b} /></Section>
          <Section title="Escrow & your payout"><PaymentSummary booking={b} perspective="contractor" /></Section>
        </div>
        <Section title="Activity"><Timeline booking={b} /></Section>
      </div>
    </div>
  );
}

/* --------------------------------- rework --------------------------------- */
function ReworkTab({ claims, onDone }: { claims: ClaimItem[]; onDone: () => void }) {
  const toast = useToast();
  const [notes, setNotes] = useState<Record<number, string>>({});
  if (!claims.length) return <Empty icon={<Icon.Shield className="h-8 w-8" />} title="No warranty rework tickets">When a customer claims ChopeFix Protection on your work, the ticket lands here.</Empty>;
  return (
    <div className="space-y-4">
      {claims.map((c) => (
        <Card key={c.id} className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2"><Badge tone={c.status === 'open' ? 'sky' : 'emerald'} dot>{c.status === 'open' ? 'Open rework ticket' : 'Resolved'}</Badge><span className="font-mono text-xs text-slate-400">#{c.id} · {c.booking.ref}</span></div>
              <h3 className="mt-2 text-lg font-bold text-ink">{c.booking.jobTitle}</h3>
              <div className="text-sm text-slate-600">{c.booking.customer.name} · {c.booking.address.unitNo}, S({c.booking.address.postalCode}) · claimed {relTime(c.createdAt)}</div>
              <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900">“{c.issue}”</p>
              {c.contractorNote && <p className="mt-2 text-sm text-slate-600"><b>Your fix:</b> {c.contractorNote}</p>}
            </div>
            <div className="text-right text-xs text-slate-500">Warranty until {c.booking.warrantyUntil ? fmtDate(c.booking.warrantyUntil) : '-'}<br />No charge to customer</div>
          </div>
          {c.status === 'open' ? (
            <div className="mt-4 max-w-xl">
              <PhotoCapture label="Fix it and upload fresh photo proof" cta="Resolve rework"
                extra={<Field label="What did you fix?"><input className={inputCls} value={notes[c.id] ?? ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder="e.g. Re-seated cartridge, replaced O-ring." /></Field>}
                onSubmit={async (fd) => {
                  fd.set('note', notes[c.id] ?? '');
                  try { await api.post(`/api/contractor/claims/${c.id}/resolve`, fd); toast('Rework resolved · customer notified'); onDone(); }
                  catch (e) { toast((e as Error).message, 'err'); }
                }} />
            </div>
          ) : (
            <div className="mt-4 grid max-w-xl grid-cols-2 gap-3">{c.booking.photos.filter((p) => p.claimId === c.id).map((p) => <img key={p.id} src={p.url} className="rounded-xl ring-1 ring-slate-200" alt="rework" />)}</div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* -------------------------------- earnings -------------------------------- */
function Earnings({ ledger, settings }: { ledger: Ledger; settings: Settings }) {
  const t = ledger.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ['Held in escrow', sgd(t.heldEscrow), 'Jobs in progress', 'text-sky-700'],
          ['Gross released', sgd(t.grossReleased), `${t.jobsReleased} completed jobs`, 'text-ink'],
          [`ChopeFix fees (${pct(settings.feeBps)})`, `−${sgd(t.fees)}`, 'Per transaction', 'text-slate-500'],
          [`Reserve held (${pct(settings.reserveBps)})`, sgd(t.reserveHeld), `Returned after ${settings.warrantyDays} days`, 'text-amber-700'],
          ['Net paid out', sgd(t.netReleased), `+ ${sgd(t.reserveReleased)} reserve returned`, 'text-teal-700'],
        ].map(([l, v, s, c]) => (
          <Card key={l} className="p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{l}</div><div className={cx('tabular mt-1 text-2xl font-extrabold', c)}>{v}</div><div className="text-xs text-slate-500">{s}</div></Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="px-5 py-3">Job</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Gross</th><th className="px-3 py-3 text-right">Fee</th><th className="px-3 py-3 text-right">Reserve</th><th className="px-5 py-3 text-right">Net</th></tr></thead>
          <tbody>
            {ledger.entries.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3"><div className="font-semibold text-ink">{e.jobTitle}</div><div className="text-xs text-slate-500">{e.ref} · {fmtDateTime(e.at)}{e.releaseType ? ` · ${e.releaseType === 'auto' ? 'auto-released' : e.releaseType === 'ops' ? 'ops release' : 'customer confirmed'}` : ''}</div></td>
                <td className="px-3 py-3"><StatusBadge status={e.status} /></td>
                <td className="tabular px-3 py-3 text-right">{sgd(e.gross)}</td>
                <td className="tabular px-3 py-3 text-right text-slate-500">−{sgd(e.fee)}</td>
                <td className="tabular px-3 py-3 text-right text-amber-700">{sgd(e.reserve)}{e.warrantyUntil && <div className="text-[10.5px] text-slate-400">until {fmtDate(e.warrantyUntil)}</div>}</td>
                <td className={cx('tabular px-5 py-3 text-right font-bold', e.status === 'completed' ? 'text-teal-700' : 'text-slate-400')}>{e.status === 'refunded' || e.status === 'cancelled' ? sgd(0) : sgd(e.net)}{e.status !== 'completed' && e.status !== 'refunded' && e.status !== 'cancelled' && <div className="text-[10.5px] font-normal">on release</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">The rolling reserve funds ChopeFix Protection: if a warranty rework can’t be completed, the customer’s remedy is paid from it. Otherwise it’s returned automatically when the job’s 30-day warranty ends.</p>
    </div>
  );
}

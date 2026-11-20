import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Booking, CatalogItem, Settings, Trade, User } from '../types';
import { sgd, pct, fmtWindowDate } from '../format';
import { Badge, Button, Card, ComplianceBadge, Empty, Icon, Segmented, StatusBadge, TradeChip, TradeIcon, cx, inputCls } from '../components/ui';
import { BookingDrawer } from './BookingDrawer';
import { BookingTracker } from './BookingTracker';

type Filter = 'All' | Trade;

export function CustomerApp({ user, settings, onNeedAuth }: { user: User | null; settings: Settings; onNeedAuth: () => void }) {
  const [tab, setTab] = useState<'catalog' | 'bookings'>('catalog');
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<Filter>('All');
  const [q, setQ] = useState('');
  const [booking, setBooking] = useState<CatalogItem | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => { api.get<{ items: CatalogItem[] }>('/api/catalog').then((r) => setCatalog(r.items)); }, []);
  const loadBookings = useCallback(async () => {
    if (!user) return;
    const r = await api.get<{ items: Booking[] }>('/api/bookings');
    setBookings(r.items);
    setSelected((s) => s ?? r.items.find((b) => !['completed', 'cancelled', 'refunded'].includes(b.status))?.id ?? r.items[0]?.id ?? null);
  }, [user]);
  useEffect(() => { loadBookings(); }, [loadBookings]);
  useEffect(() => {
    if (tab !== 'bookings') return;
    const t = setInterval(loadBookings, 5000);
    return () => clearInterval(t);
  }, [tab, loadBookings]);

  const items = useMemo(() => catalog.filter((c) => (filter === 'All' || c.trade === filter) && (!q || `${c.title} ${c.summary} ${c.scope.join(' ')}`.toLowerCase().includes(q.toLowerCase()))), [catalog, filter, q]);
  const active = bookings.filter((b) => !['completed', 'cancelled', 'refunded'].includes(b.status));
  const needsAction = bookings.filter((b) => b.addons.some((a) => a.status === 'pending') || b.status === 'awaiting_confirmation').length;
  const sel = bookings.find((b) => b.id === selected) ?? null;

  return (
    <div className="space-y-6">
      {user && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented value={tab} onChange={setTab} options={[
            { value: 'catalog', label: 'Book a fix' },
            { value: 'bookings', label: <span className="flex items-center gap-1.5">My bookings{needsAction > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] text-ink">{needsAction}</span>}</span> },
          ]} />
          {active.length > 0 && tab === 'catalog' && (
            <button onClick={() => { setSelected(active[0].id); setTab('bookings'); }} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-ink shadow-sm ring-1 ring-slate-200 hover:ring-teal-300">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" /></span>
              {active.length} live job{active.length > 1 ? 's' : ''} · track
            </button>
          )}
        </div>
      )}

      {tab === 'catalog' && (
        <>
          <Hero settings={settings} />
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {(['All', 'Plumbing', 'Electrical', 'Handyman'] as Filter[]).map((t) => (
                <button key={t} onClick={() => setFilter(t)}
                  className={cx('flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset transition', filter === t ? 'bg-ink text-white ring-ink' : 'bg-white text-slate-700 ring-slate-200 hover:ring-slate-300')}>
                  {t !== 'All' && <TradeIcon trade={t} className="h-4 w-4" />}{t}
                  <span className={cx('text-xs', filter === t ? 'text-teal-200' : 'text-slate-400')}>{t === 'All' ? catalog.length : catalog.filter((c) => c.trade === t).length}</span>
                </button>
              ))}
            </div>
            <div className="relative md:w-80">
              <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={cx(inputCls, 'pl-10')} placeholder="Search “tap”, “socket”, “TV mount”…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => <JobCard key={c.id} item={c} onBook={() => (user ? setBooking(c) : onNeedAuth())} />)}
          </div>
          {items.length === 0 && <Empty icon={<Icon.Search className="h-8 w-8" />} title="No standard job matches that search">Try a broader word, or pick a different trade.</Empty>}
        </>
      )}

      {tab === 'bookings' && user && (
        bookings.length === 0 ? <Empty icon={<Icon.Wrench className="h-8 w-8" />} title="No bookings yet">Pick a fixed-price job from the catalog to get started.</Empty> : (
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <div className="space-y-2.5">
              {bookings.map((b) => {
                const pending = b.addons.some((a) => a.status === 'pending');
                return (
                  <button key={b.id} onClick={() => setSelected(b.id)} className={cx('w-full rounded-2xl bg-white p-4 text-left ring-1 transition', selected === b.id ? 'ring-2 ring-teal-500 shadow-md' : 'ring-slate-200 hover:ring-slate-300')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-ink"><TradeIcon trade={b.trade} className="h-4.5 w-4.5" /></span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-ink">{b.jobTitle}</div>
                          <div className="text-xs text-slate-500">{b.ref} · {fmtWindowDate(b.windowDate)} {b.windowSlot}</div>
                        </div>
                      </div>
                      <span className="tabular text-sm font-bold text-ink">{sgd(b.amounts.gross, 0)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={b.status} />
                      {pending && <Badge tone="amber">Add-on needs approval</Badge>}
                      {b.warrantyActive && <Badge tone="emerald"><Icon.Shield className="h-3 w-3" />Protected</Badge>}
                      {b.claims.some((c) => c.status === 'open') && <Badge tone="sky">Rework open</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
            {sel && <BookingTracker key={sel.id} booking={sel} settings={settings} onChange={(nb) => setBookings((xs) => xs.map((x) => (x.id === nb.id ? nb : x)))} />}
          </div>
        )
      )}

      {booking && user && (
        <BookingDrawer item={booking} user={user} settings={settings} onClose={() => setBooking(null)}
          onBooked={(b) => { setBooking(null); setBookings((xs) => [b, ...xs]); setSelected(b.id); setTab('bookings'); }} />
      )}
    </div>
  );
}

function Hero({ settings }: { settings: Settings }) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink px-6 py-8 text-white sm:px-10 sm:py-10">
      <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-40 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
      <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        <div>
          <Badge tone="amber" className="!bg-amber-400/15 !text-amber-200 !ring-amber-300/30">Singapore · Plumbing · Electrical · Handyman</Badge>
          <h1 className="mt-4 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-[42px]">Chope a verified pro.<br /><span className="text-teal-300">Fixed price.</span> Pay only when it’s fixed.</h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-300">No quotes, no haggling. Your payment is held safely until the job is done with photo proof, then every repair logged in-app is covered by {settings.warrantyDays}-day ChopeFix Protection.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-1">
          {[
            [Icon.Lock, 'Held payment', `Released only on your OK or ${settings.autoReleaseHours}h after photo proof`],
            [Icon.Camera, 'Photo-verified', 'Geo & time-stamped Before/After shots'],
            [Icon.Shield, `${settings.warrantyDays}-day warranty`, 'Free rework on in-app jobs & add-ons'],
          ].map(([I, t, d]) => {
            const C = I as typeof Icon.Lock;
            return (
              <div key={t as string} className="flex flex-col gap-2 rounded-2xl bg-white/[.06] p-3.5 ring-1 ring-white/10 lg:flex-row lg:items-center lg:gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-400/15 text-teal-300"><C className="h-5 w-5" /></span>
                <div><div className="text-sm font-bold">{t as string}</div><div className="hidden text-xs text-slate-400 sm:block">{d as string}</div></div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="relative mt-6 text-xs text-slate-400">ChopeFix fee ({pct(settings.feeBps)}) is deducted from the contractor’s payout. You pay the price you see.</p>
    </section>
  );
}

function JobCard({ item, onBook }: { item: CatalogItem; onBook: () => void }) {
  return (
    <Card className="group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center justify-between">
        <TradeChip trade={item.trade} />
        <span className="flex items-center gap-1 text-xs font-semibold text-slate-500"><Icon.Clock className="h-3.5 w-3.5" />~{item.durationMin} min</span>
      </div>
      <h3 className="mt-3.5 text-[17px] font-bold leading-snug text-ink">{item.title}</h3>
      <p className="mt-1 text-sm text-slate-500">{item.summary}</p>
      <ul className="mt-3.5 space-y-1.5">
        {item.scope.slice(0, 3).map((s) => (
          <li key={s} className="flex items-start gap-2 text-[13px] text-slate-700"><Icon.Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600" />{s}</li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <ComplianceBadge text={item.compliance} />
        <Badge tone="emerald"><Icon.Shield className="h-3.5 w-3.5" />30-day warranty</Badge>
      </div>
      <div className="mt-auto flex items-end justify-between pt-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fixed price</div>
          <div className="tabular text-2xl font-extrabold tracking-tight text-ink">{sgd(item.price, 0)}</div>
        </div>
        <Button variant="accent" onClick={onBook}>Chope it</Button>
      </div>
    </Card>
  );
}

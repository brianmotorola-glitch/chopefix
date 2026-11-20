import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Booking, CatalogItem, Settings, Trade } from '../types';
import { sgd, pct, fmtDate, fmtDateTime, relTime, STATUS_META } from '../format';
import { Avatar, Badge, Button, Card, ComplianceBadge, Empty, Field, Icon, Modal, Segmented, StatusBadge, TradeChip, cx, inputCls, useToast } from '../components/ui';
import { PhotoGallery } from '../components/booking';

type Kpis = { gmv: number; escrowHeld: number; feesEarned: number; reserveHeld: number; completedJobs: number; openDisputes: number; activeWarranties: number; openClaims: number; totalBookings: number; liveJobs: number; refunded: number; avgTicket: number };
type Queue = {
  disputes: Array<{ id: number; reason: string; details: string; status: string; resolutionNote: string | null; createdAt: number; resolvedAt: number | null; booking: Booking }>;
  claims: Array<{ id: number; issue: string; status: string; contractorNote: string | null; createdAt: number; resolvedAt: number | null; booking: Booking }>;
  warranties: Booking[];
};
type ContractorRow = { id: number; name: string; email: string; trade: Trade; licenceType: string; licenceNo: string; verified: boolean; rating: number; jobsDone: number; initials: string };

export function AdminApp({ settings }: { settings: Settings }) {
  const [tab, setTab] = useState<'overview' | 'queue' | 'catalog' | 'pros'>('overview');
  const [k, setK] = useState<{ kpis: Kpis; byTrade: { trade: Trade; n: number }[]; byStatus: { status: Booking['status']; n: number }[]; feeBps: number; reserveBps: number } | null>(null);
  const [queue, setQueue] = useState<Queue | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const load = useCallback(async () => {
    const [a, q, b] = await Promise.all([api.get<NonNullable<typeof k>>('/api/admin/kpis'), api.get<Queue>('/api/admin/queue'), api.get<{ items: Booking[] }>('/api/bookings')]);
    setK(a); setQueue(q); setBookings(b.items);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);
  const openDisputes = queue?.disputes.filter((d) => d.status === 'open').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">Ops console · live from SQLite</div><h1 className="text-2xl font-extrabold tracking-tight text-ink">Marketplace health</h1></div>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' },
          { value: 'queue', label: <>Disputes & warranty {openDisputes > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1.5 text-[11px] text-white">{openDisputes}</span>}</> },
          { value: 'catalog', label: 'Price catalog' },
          { value: 'pros', label: 'Contractors' },
        ]} />
      </div>

      {tab === 'overview' && k && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total GMV" value={sgd(k.kpis.gmv, 0)} sub={`Avg ticket ${sgd(k.kpis.avgTicket, 0)}`} icon={<Icon.Wallet className="h-4 w-4" />} />
            <Kpi label="Escrow held" value={sgd(k.kpis.escrowHeld, 0)} sub={`${k.kpis.liveJobs} live jobs`} icon={<Icon.Lock className="h-4 w-4" />} tone="sky" />
            <Kpi label={`Fees earned (${pct(k.feeBps)})`} value={sgd(k.kpis.feesEarned)} sub="On released payouts" icon={<Icon.Sparkle className="h-4 w-4" />} tone="teal" />
            <Kpi label="Completed jobs" value={String(k.kpis.completedJobs)} sub={`of ${k.kpis.totalBookings} bookings`} icon={<Icon.Check className="h-4 w-4" />} tone="emerald" />
            <Kpi label="Open disputes" value={String(k.kpis.openDisputes)} sub={`${k.kpis.openClaims} open rework tickets`} icon={<Icon.Alert className="h-4 w-4" />} tone={k.kpis.openDisputes ? 'rose' : 'slate'} />
            <Kpi label="Active warranties" value={String(k.kpis.activeWarranties)} sub={`${sgd(k.kpis.reserveHeld)} reserve held`} icon={<Icon.Shield className="h-4 w-4" />} tone="amber" />
          </div>
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <Card className="overflow-x-auto">
              <div className="flex items-center justify-between px-5 pt-5"><h3 className="font-bold text-ink">All bookings</h3><span className="text-xs text-slate-400">auto-refreshing</span></div>
              <table className="mt-3 w-full min-w-[680px] text-sm">
                <thead><tr className="border-y border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="px-5 py-2.5">Booking</th><th className="px-3 py-2.5">Pro</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Gross</th><th className="px-5 py-2.5 text-right">Fee</th></tr></thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3"><div className="font-semibold text-ink">{b.jobTitle}</div><div className="text-xs text-slate-500">{b.ref} · {b.customer.name} · {b.address.area} · {relTime(b.createdAt)}</div></td>
                      <td className="px-3 py-3 text-[13px]">{b.contractor?.name ?? <span className="text-slate-400">Unassigned</span>}</td>
                      <td className="px-3 py-3"><StatusBadge status={b.status} /></td>
                      <td className="tabular px-3 py-3 text-right font-semibold">{sgd(b.amounts.gross)}</td>
                      <td className="tabular px-5 py-3 text-right text-teal-700">{b.status === 'completed' ? sgd(b.amounts.fee) : <span className="text-slate-400">{['refunded', 'cancelled'].includes(b.status) ? '-' : `(${sgd(b.amounts.fee)})`}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <div className="space-y-5">
              <Card className="p-5">
                <h3 className="mb-3 font-bold text-ink">Pipeline</h3>
                <div className="space-y-2">
                  {k.byStatus.map((s) => (
                    <div key={s.status} className="flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0 text-slate-600">{STATUS_META[s.status]?.label ?? s.status}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-teal-500" style={{ width: `${(s.n / Math.max(1, k.kpis.totalBookings)) * 100}%` }} /></span>
                      <span className="tabular w-6 text-right font-semibold">{s.n}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="mb-3 font-bold text-ink">Demand by trade</h3>
                <div className="space-y-2">{k.byTrade.map((t) => <div key={t.trade} className="flex items-center justify-between"><TradeChip trade={t.trade} /><span className="tabular font-bold text-ink">{t.n}</span></div>)}</div>
              </Card>
              <Card className="p-5 text-[13px] text-slate-600">
                <h3 className="mb-2 font-bold text-ink">Rules in force</h3>
                <ul className="space-y-1.5">
                  <li>• ChopeFix fee <b>{pct(settings.feeBps)}</b> of gross, deducted from payout</li>
                  <li>• Rolling workmanship reserve <b>{pct(settings.reserveBps)}</b>, held {settings.warrantyDays} days</li>
                  <li>• Auto-release <b>{settings.autoReleaseHours}h</b> after After photo, unless disputed</li>
                  <li>• Warranty covers base job + in-app approved add-ons only</li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}

      {tab === 'queue' && queue && <QueueView queue={queue} reload={load} />}
      {tab === 'catalog' && <CatalogManager />}
      {tab === 'pros' && <Contractors />}
    </div>
  );
}

function Kpi({ label, value, sub, icon, tone = 'slate' }: { label: string; value: string; sub: string; icon: React.ReactNode; tone?: 'slate' | 'sky' | 'teal' | 'emerald' | 'rose' | 'amber' }) {
  const t = { slate: 'bg-slate-100 text-slate-600', sky: 'bg-sky-100 text-sky-700', teal: 'bg-teal-100 text-teal-700', emerald: 'bg-emerald-100 text-emerald-700', rose: 'bg-rose-100 text-rose-700', amber: 'bg-amber-100 text-amber-700' }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span><span className={cx('flex h-7 w-7 items-center justify-center rounded-lg', t)}>{icon}</span></div>
      <div className="tabular mt-2 text-2xl font-extrabold tracking-tight text-ink">{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </Card>
  );
}

function QueueView({ queue, reload }: { queue: Queue; reload: () => void }) {
  const toast = useToast();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (id: number, action: 'release' | 'refund') => {
    setBusy(`${action}${id}`);
    try { await api.post(`/api/admin/disputes/${id}/resolve`, { action, note: notes[id] }); toast(action === 'release' ? 'Payout released to contractor' : 'Customer refunded'); reload(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(null); }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-4">
        <h3 className="font-bold text-ink">Disputes</h3>
        {queue.disputes.length === 0 && <Empty icon={<Icon.Check className="h-8 w-8" />} title="No disputes">Customers can pause payouts with “Report an issue”.</Empty>}
        {queue.disputes.map((d) => (
          <Card key={d.id} className={cx('p-5', d.status === 'open' && 'ring-2 ring-rose-200')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><Badge tone={d.status === 'open' ? 'rose' : d.status === 'released' ? 'emerald' : 'slate'} dot>{d.status === 'open' ? 'Open · payout paused' : d.status === 'released' ? 'Released to pro' : 'Refunded'}</Badge><span className="font-mono text-xs text-slate-400">{d.booking.ref}</span></div>
                <div className="mt-2 font-bold text-ink">{d.reason}</div>
                <div className="text-sm text-slate-600">{d.details || 'No details given.'}</div>
                <div className="mt-1 text-xs text-slate-500">{d.booking.jobTitle} · {d.booking.customer.name} vs {d.booking.contractor?.name} · {fmtDateTime(d.createdAt)}</div>
              </div>
              <div className="tabular text-right text-lg font-extrabold text-ink">{sgd(d.booking.amounts.gross)}</div>
            </div>
            <div className="mt-3"><PhotoGallery booking={d.booking} /></div>
            {d.status === 'open' ? (
              <div className="mt-3 space-y-2">
                <input className={inputCls} placeholder="Resolution note (shared with both parties)" value={notes[d.id] ?? ''} onChange={(e) => setNotes({ ...notes, [d.id]: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" loading={busy === `release${d.id}`} onClick={() => resolve(d.id, 'release')}>Release payout to pro</Button>
                  <Button variant="danger" loading={busy === `refund${d.id}`} onClick={() => resolve(d.id, 'refund')}>Refund customer</Button>
                </div>
              </div>
            ) : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{d.resolutionNote}</p>}
          </Card>
        ))}
      </div>
      <div className="space-y-4">
        <h3 className="font-bold text-ink">Warranty rework tickets</h3>
        {queue.claims.length === 0 && <Empty icon={<Icon.Shield className="h-8 w-8" />} title="No warranty claims yet" />}
        {queue.claims.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-center justify-between gap-2"><span className="font-semibold text-ink">#{c.id} · {c.booking.jobTitle}</span><Badge tone={c.status === 'open' ? 'sky' : 'emerald'} dot>{c.status === 'open' ? 'With contractor' : 'Resolved'}</Badge></div>
            <p className="mt-1 text-sm text-slate-600">“{c.issue}”</p>
            <p className="mt-1 text-xs text-slate-500">{c.booking.ref} · {c.booking.contractor?.name} · opened {relTime(c.createdAt)}{c.contractorNote ? ` · fix: ${c.contractorNote}` : ''}</p>
          </Card>
        ))}
        <h3 className="pt-2 font-bold text-ink">Active ChopeFix Protection ({queue.warranties.length})</h3>
        <Card className="divide-y divide-slate-100">
          {queue.warranties.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div><div className="font-semibold text-ink">{w.jobTitle}{w.addons.some((a) => a.status === 'approved') && <span className="text-slate-500"> + {w.addons.filter((a) => a.status === 'approved').length} add-on</span>}</div><div className="text-xs text-slate-500">{w.ref} · {w.customer.name} · {w.contractor?.name}</div></div>
              <div className="text-right"><div className="tabular font-semibold">{sgd(w.amounts.gross)}</div><div className="text-xs text-emerald-700">until {w.warrantyUntil ? fmtDate(w.warrantyUntil) : ''}</div></div>
            </div>
          ))}
          {queue.warranties.length === 0 && <div className="px-4 py-6 text-center text-sm text-slate-500">None yet</div>}
        </Card>
      </div>
    </div>
  );
}

const blank = { id: 0, trade: 'Plumbing' as Trade, title: '', summary: '', scope: '', durationMin: '45', price: '', active: true };
function CatalogManager() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [edit, setEdit] = useState<typeof blank | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = useCallback(() => api.get<{ items: CatalogItem[] }>('/api/admin/catalog').then((r) => setItems(r.items)), []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    const body = { trade: edit.trade, title: edit.title, summary: edit.summary, scope: edit.scope.split('\n'), durationMin: Number(edit.durationMin), price: Number(edit.price), active: edit.active };
    try {
      if (edit.id) await api.put(`/api/admin/catalog/${edit.id}`, body); else await api.post('/api/admin/catalog', body);
      toast(edit.id ? 'Price updated live' : 'New standard job published');
      setEdit(null); load();
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  const toggle = async (c: CatalogItem) => { await api.put(`/api/admin/catalog/${c.id}`, { active: !c.active }); load(); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-500">{items.length} standard jobs · changes apply to new bookings instantly (existing bookings keep their locked price).</p><Button variant="accent" onClick={() => setEdit({ ...blank })}><Icon.Plus className="h-4 w-4" />Add standard job</Button></div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="px-5 py-3">Job</th><th className="px-3 py-3">Compliance</th><th className="px-3 py-3 text-right">Duration</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3">Live</th><th className="px-5 py-3" /></tr></thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} className={cx('border-b border-slate-50 last:border-0', !c.active && 'opacity-50')}>
                <td className="px-5 py-3"><div className="flex items-center gap-2"><TradeChip trade={c.trade} /><span className="font-semibold text-ink">{c.title}</span></div><div className="mt-1 text-xs text-slate-500">{c.summary}</div></td>
                <td className="px-3 py-3"><ComplianceBadge text={c.compliance} /></td>
                <td className="tabular px-3 py-3 text-right">{c.durationMin} min</td>
                <td className="tabular px-3 py-3 text-right text-base font-extrabold text-ink">{sgd(c.price, 0)}</td>
                <td className="px-3 py-3"><button onClick={() => toggle(c)} className={cx('relative h-5 w-9 rounded-full transition', c.active ? 'bg-teal-500' : 'bg-slate-300')}><span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', c.active ? 'left-[18px]' : 'left-0.5')} /></button></td>
                <td className="px-5 py-3 text-right"><Button size="sm" variant="secondary" onClick={() => setEdit({ id: c.id, trade: c.trade, title: c.title, summary: c.summary, scope: c.scope.join('\n'), durationMin: String(c.durationMin), price: String(c.price / 100), active: c.active })}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Update standard job' : 'New standard job'}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Trade"><select className={inputCls} value={edit.trade} onChange={(e) => setEdit({ ...edit, trade: e.target.value as Trade })}><option>Plumbing</option><option>Electrical</option><option>Handyman</option></select></Field>
              <Field label="Price (S$)"><input className={inputCls} inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
              <Field label="Minutes"><input className={inputCls} inputMode="numeric" value={edit.durationMin} onChange={(e) => setEdit({ ...edit, durationMin: e.target.value })} /></Field>
            </div>
            <Field label="Title"><input className={inputCls} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Kitchen sink trap replacement" /></Field>
            <Field label="Summary"><input className={inputCls} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></Field>
            <Field label="Included scope (one per line)"><textarea className={cx(inputCls, 'min-h-[90px]')} value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })} /></Field>
            <p className="text-xs text-slate-500">Compliance tag is set automatically: {edit.trade === 'Electrical' ? 'EMA LEW verified contractor' : edit.trade === 'Plumbing' ? 'PUB simple plumbing scope' : 'ChopeFix vetted · insured'}.</p>
            <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={save}>{edit.id ? 'Save changes' : 'Publish job'}</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Contractors() {
  const [items, setItems] = useState<ContractorRow[]>([]);
  const load = useCallback(() => api.get<{ items: ContractorRow[] }>('/api/admin/contractors').then((r) => setItems(r.items)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((c) => (
        <Card key={c.id} className="p-5">
          <div className="flex items-start gap-3">
            <Avatar initials={c.initials} trade={c.trade} verified={c.verified} />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-ink">{c.name}</div>
              <div className="truncate text-xs text-slate-500">{c.email}</div>
              <div className="mt-2 flex flex-wrap gap-1.5"><TradeChip trade={c.trade} /><Badge tone={c.verified ? 'teal' : 'amber'} dot>{c.verified ? 'Verified' : 'Pending'}</Badge></div>
              <div className="mt-2 text-xs text-slate-600">{c.licenceType} · <span className="font-mono">{c.licenceNo}</span></div>
              <div className="mt-1 text-xs text-slate-500">★ {c.rating.toFixed(1)} · {c.jobsDone} jobs</div>
            </div>
          </div>
          <Button className="mt-4 w-full" size="sm" variant={c.verified ? 'secondary' : 'success'} onClick={async () => { await api.post(`/api/admin/contractors/${c.id}/verify`, { verified: !c.verified }); load(); }}>{c.verified ? 'Suspend verification' : 'Verify licence & ID'}</Button>
        </Card>
      ))}
    </div>
  );
}

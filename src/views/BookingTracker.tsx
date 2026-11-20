import { useState } from 'react';
import { api } from '../api';
import type { Booking, Settings } from '../types';
import { sgd, fmtDate, fmtDateTime, fmtWindowDate } from '../format';
import { Badge, Button, Card, Countdown, Field, Icon, Modal, StatusBadge, Stepper, TradeChip, inputCls, useToast, cx } from '../components/ui';
import { ContractorCard, OffAppNotice, PaymentSummary, PhotoGallery, Section, Timeline } from '../components/booking';
import { CertificateModal } from './Certificate';

const REASONS = ['Job not completed', 'Quality / still faulty', 'Damage caused during job', 'Price or add-on disagreement', 'Contractor no-show', 'Other'];

export function BookingTracker({ booking: b, settings, onChange }: { booking: Booking; settings: Settings; onChange: (b: Booking) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<null | 'issue' | 'claim' | 'cert'>(null);
  const [reason, setReason] = useState(REASONS[1]);
  const [details, setDetails] = useState('');
  const [issue, setIssue] = useState('');
  const toast = useToast();

  const act = async (key: string, url: string, body: unknown, msg: string) => {
    setBusy(key);
    try {
      const r = await api.post<{ booking: Booking }>(url, body);
      onChange(r.booking);
      toast(msg);
      setModal(null);
    } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(null); }
  };
  const pending = b.addons.filter((a) => a.status === 'pending');
  const openClaim = b.claims.find((c) => c.status === 'open');

  return (
    <div className="animate-rise space-y-5">
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><TradeChip trade={b.trade} /><span className="font-mono text-xs font-semibold text-slate-400">{b.ref}</span></div>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight text-ink">{b.jobTitle}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Icon.Pin className="h-4 w-4" />{b.address.unitNo}, S({b.address.postalCode}) · {b.address.area}</span>
                <span className="flex items-center gap-1"><Icon.Clock className="h-4 w-4" />{fmtWindowDate(b.windowDate)}, {b.windowSlot}</span>
              </div>
            </div>
            <StatusBadge status={b.status} />
          </div>
          <div className="mt-5"><Stepper status={b.status} /></div>
        </div>

        <div className="space-y-4 p-5">
          {b.status === 'requested' && (
            <Banner tone="sky" icon={<Icon.Search className="h-5 w-5" />} title="Matching you with a verified pro nearby"
              text={`${sgd(b.amounts.gross)} is held safely. Verified ${b.trade.toLowerCase()} pros in ${b.address.area} can see this fixed-price job now.`}
              actions={<Button variant="secondary" size="sm" loading={busy === 'cancel'} onClick={() => act('cancel', `/api/bookings/${b.id}/cancel`, {}, 'Booking cancelled · hold released')}>Cancel booking</Button>} />
          )}
          {b.status === 'accepted' && <Banner tone="violet" icon={<Icon.Check className="h-5 w-5" />} title={`${b.contractor?.name} is confirmed`} text={`Arriving ${fmtWindowDate(b.windowDate).toLowerCase()}, ${b.windowSlot}. They’ll check in with a geo-tagged Before photo on arrival.`} />}

          {pending.map((a) => (
            <div key={a.id} className="rounded-2xl bg-amber-50 p-4 ring-2 ring-amber-300">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-ink"><Icon.Plus className="h-5 w-5" /></span>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wide text-amber-700">On-site add-on needs your approval</div>
                    <div className="mt-0.5 text-base font-bold text-ink">{a.label} · <span className="tabular">{sgd(a.price)}</span></div>
                    <div className="mt-1 text-[13px] text-amber-900">Approve to add it to your held payment and cover it under the 30-day warranty. Paying cash on site is not protected.</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" loading={busy === `d${a.id}`} onClick={() => act(`d${a.id}`, `/api/bookings/${b.id}/addons/${a.id}/decision`, { approve: false }, 'Add-on declined')}>Decline</Button>
                  <Button variant="success" size="sm" loading={busy === `a${a.id}`} onClick={() => act(`a${a.id}`, `/api/bookings/${b.id}/addons/${a.id}/decision`, { approve: true }, `Approved · ${sgd(a.price)} added to escrow & warranty`)}>Approve {sgd(a.price, 0)}</Button>
                </div>
              </div>
            </div>
          ))}
          {b.status === 'in_progress' && pending.length === 0 && <Banner tone="amber" icon={<Icon.Wrench className="h-5 w-5" />} title={`${b.contractor?.name.split(' ')[0]} is on site`} text={`Checked in ${b.checkedInAt ? fmtDateTime(b.checkedInAt) : ''} SGT with a geo-tagged Before photo. Any extra parts will appear here for your approval.`} />}

          {b.status === 'awaiting_confirmation' && b.autoReleaseAt && (
            <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-ink p-5 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.14em] text-teal-200">Job marked complete with photo proof</div>
                  <div className="mt-1 text-lg font-bold">Check the After photo, then release payment</div>
                  <div className="mt-1 text-sm text-teal-100">Auto-releases to {b.contractor?.name.split(' ')[0]} in <Countdown until={b.autoReleaseAt} className="font-bold text-white" /> unless you report an issue.</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3 text-center ring-1 ring-white/20"><div className="text-[11px] uppercase tracking-wide text-teal-200">Auto-release</div><Countdown until={b.autoReleaseAt} className="text-2xl font-bold" /></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="accent" loading={busy === 'done'} onClick={() => act('done', `/api/bookings/${b.id}/mark-done`, {}, 'Payment released · 30-day protection active')}><Icon.Check className="h-4 w-4" />Mark job as done</Button>
                <Button variant="secondary" onClick={() => setModal('issue')} className="!bg-white/10 !text-white !ring-white/30 hover:!bg-white/20"><Icon.Alert className="h-4 w-4" />Report an issue</Button>
                {settings.demoMode && <Button variant="ghost" loading={busy === 'auto'} className="!text-teal-100 hover:!bg-white/10" onClick={() => act('auto', `/api/bookings/${b.id}/simulate-auto-release`, {}, 'Demo: 24h elapsed · payout auto-released')}><Icon.Clock className="h-4 w-4" />Simulate 24h auto-release</Button>}
              </div>
            </div>
          )}

          {b.status === 'disputed' && b.dispute && <Banner tone="rose" icon={<Icon.Alert className="h-5 w-5" />} title="Payout paused · ChopeFix Ops is reviewing" text={`You reported: “${b.dispute.reason}”${b.dispute.details ? ` (${b.dispute.details})` : ''}. Funds stay held until Ops releases or refunds, usually within 1 business day.`} />}
          {b.status === 'refunded' && <Banner tone="slate" icon={<Icon.Wallet className="h-5 w-5" />} title={`${sgd(b.amounts.gross)} refunded`} text={b.dispute?.resolutionNote ?? 'Held funds were returned to your original payment method.'} />}
          {b.status === 'cancelled' && <Banner tone="slate" icon={<Icon.X className="h-5 w-5" />} title="Booking cancelled" text="Your payment hold was released. No charge." />}

          {b.status === 'completed' && (
            <div className="rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white"><Icon.Shield className="h-6 w-6" /></span>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">ChopeFix Protection {b.warrantyActive ? 'active' : 'expired'}</div>
                    <div className="text-lg font-bold text-ink">Covered until {b.warrantyUntil ? fmtDate(b.warrantyUntil) : '-'}</div>
                    <div className="text-[13px] text-emerald-900">{b.jobTitle}{b.addons.filter((a) => a.status === 'approved').map((a) => ` + ${a.label}`).join('')} · {sgd(b.amounts.gross)} covered</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setModal('cert')}><Icon.Doc className="h-4 w-4" />Warranty certificate</Button>
                  {b.warrantyActive && <Button variant="primary" disabled={!!openClaim} onClick={() => setModal('claim')}><Icon.Wrench className="h-4 w-4" />{openClaim ? 'Rework in progress' : 'Claim warranty rework'}</Button>}
                </div>
              </div>
              {b.claims.length > 0 && (
                <div className="mt-4 space-y-2">
                  {b.claims.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-emerald-100">
                      <div><div className="font-semibold text-ink">Rework ticket #{c.id}: {c.issue}</div>{c.contractorNote && <div className="mt-0.5 text-xs text-slate-500">Contractor: {c.contractorNote}</div>}</div>
                      <Badge tone={c.status === 'open' ? 'sky' : 'emerald'} dot>{c.status === 'open' ? 'Dispatched to contractor' : `Resolved ${c.resolvedAt ? fmtDateTime(c.resolvedAt) : ''}`}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-5">
          {b.contractor ? <Section title="Your pro"><ContractorCard c={b.contractor} /></Section> : <Section title="Your pro"><p className="text-sm text-slate-500">Assigned as soon as a verified pro accepts. Usually within 15 minutes in the daytime.</p></Section>}
          <Section title="Photo proof" right={<span className="text-xs text-slate-400">Geo + time stamped</span>}>
            <PhotoGallery booking={b} />
            {b.completionNote && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-[13px] text-slate-600"><b className="text-ink">Pro’s note:</b> {b.completionNote}</p>}
          </Section>
          <Section title="Payment"><PaymentSummary booking={b} perspective="customer" /></Section>
          <OffAppNotice />
        </div>
        <Section title="Activity"><Timeline booking={b} /></Section>
      </div>

      <Modal open={modal === 'issue'} onClose={() => setModal(null)} title="Report an issue">
        <p className="mb-4 text-sm text-slate-500">Reporting pauses the payout immediately. ChopeFix Ops reviews the photos and both sides before releasing or refunding.</p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {REASONS.map((r) => <button key={r} onClick={() => setReason(r)} className={cx('rounded-xl px-3 py-2 text-left text-[13px] font-semibold ring-1', reason === r ? 'bg-rose-50 text-rose-800 ring-rose-300' : 'ring-slate-200 hover:bg-slate-50')}>{r}</button>)}
        </div>
        <Field label="What happened?"><textarea className={cx(inputCls, 'min-h-[90px]')} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="e.g. Tap still drips after 10 minutes." /></Field>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button variant="danger" loading={busy === 'issue'} onClick={() => act('issue', `/api/bookings/${b.id}/report-issue`, { reason, details }, 'Issue reported · payout paused')}>Pause payout & report</Button></div>
      </Modal>
      <Modal open={modal === 'claim'} onClose={() => setModal(null)} title="Claim free warranty rework">
        <p className="mb-4 text-sm text-slate-500">We’ll dispatch a rework ticket to {b.contractor?.name} at no cost. Covered: {b.jobTitle}{b.addons.filter((a) => a.status === 'approved').map((a) => `, ${a.label}`).join('')}.</p>
        <Field label="Describe the problem"><textarea className={cx(inputCls, 'min-h-[100px]')} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g. Tap started dripping again from the base." /></Field>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button disabled={issue.trim().length < 5} loading={busy === 'claim'} onClick={() => act('claim', `/api/bookings/${b.id}/claims`, { issue }, 'Rework ticket dispatched to your pro')}>Dispatch rework</Button></div>
      </Modal>
      {modal === 'cert' && <CertificateModal booking={b} onClose={() => setModal(null)} />}
    </div>
  );
}

function Banner({ tone, icon, title, text, actions }: { tone: 'sky' | 'violet' | 'amber' | 'rose' | 'slate'; icon: React.ReactNode; title: string; text: string; actions?: React.ReactNode }) {
  const t = { sky: 'bg-sky-50 ring-sky-200 [&_.ic]:bg-sky-500', violet: 'bg-violet-50 ring-violet-200 [&_.ic]:bg-violet-500', amber: 'bg-amber-50 ring-amber-200 [&_.ic]:bg-amber-500', rose: 'bg-rose-50 ring-rose-200 [&_.ic]:bg-rose-500', slate: 'bg-slate-50 ring-slate-200 [&_.ic]:bg-slate-500' }[tone];
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 rounded-2xl p-4 ring-1', t)}>
      <div className="flex gap-3"><span className="ic flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white">{icon}</span><div><div className="font-bold text-ink">{title}</div><div className="mt-0.5 text-[13px] text-slate-600">{text}</div></div></div>
      {actions}
    </div>
  );
}

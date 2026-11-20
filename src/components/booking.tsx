import { useState } from 'react';
import type { Booking, Contractor } from '../types';
import { sgd, pct, fmtDateTime, relTime } from '../format';
import { Avatar, Badge, Card, Icon, Modal, PhotoTile, cx } from './ui';

export function ContractorCard({ c, compact }: { c: Contractor; compact?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar initials={c.initials} trade={c.trade} verified={c.verified} size={compact ? 'md' : 'lg'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-bold text-ink">{c.name}</span>
          <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-600"><Icon.Star className="h-3.5 w-3.5" />{c.rating.toFixed(1)}</span>
          <span className="text-xs text-slate-500">{c.jobsDone} jobs · {c.yearsExp} yrs</span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge tone={c.verified ? 'teal' : 'amber'}><Icon.Shield className="h-3.5 w-3.5" />{c.verified ? 'Licence verified' : 'Verification pending'}</Badge>
          <Badge tone="slate">{c.licenceType}</Badge>
        </div>
        {!compact && <div className="mt-1.5 text-xs text-slate-500">Licence/ID {c.licenceNo} · {c.bio}</div>}
      </div>
    </div>
  );
}

export function PhotoGallery({ booking }: { booking: Booking }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!booking.photos.length) return <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500"><Icon.Camera className="mx-auto mb-1 h-5 w-5 text-slate-400" />Before & After photos appear here as proof of work.</div>;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {booking.photos.map((p) => <PhotoTile key={p.id} url={p.url} kind={p.kind} takenAt={p.takenAt} lat={p.lat} lng={p.lng} onOpen={() => setOpen(p.url)} />)}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} maxW="max-w-4xl">
        {open && <img src={open} className="w-full rounded-xl" alt="Job photo" />}
      </Modal>
    </>
  );
}

export function PaymentSummary({ booking, perspective }: { booking: Booking; perspective: 'customer' | 'contractor' | 'admin' }) {
  const a = booking.amounts;
  const released = booking.status === 'completed';
  const refunded = booking.status === 'refunded' || booking.status === 'cancelled';
  return (
    <div className="space-y-2 text-sm">
      <Line label="Fixed job price" v={sgd(a.base)} />
      {booking.addons.map((ad) => (
        <Line key={ad.id} label={<span className="flex items-center gap-1.5">+ {ad.label}<Badge tone={ad.status === 'approved' ? 'emerald' : ad.status === 'pending' ? 'amber' : 'slate'}>{ad.status}</Badge></span>} v={<span className={ad.status !== 'approved' ? 'text-slate-400 line-through' : ''}>{sgd(ad.price)}</span>} />
      ))}
      <div className="border-t border-dashed border-slate-300 pt-2">
        <Line label={<span className="flex items-center gap-1.5 font-bold text-ink"><Icon.Lock className="h-4 w-4 text-teal-600" />{refunded ? 'Refunded to customer' : released ? 'Released from escrow' : 'Held in escrow'}</span>} v={<span className="text-base font-extrabold">{sgd(a.gross)}</span>} />
      </div>
      {perspective !== 'customer' && (
        <div className="mt-1 space-y-1.5 rounded-xl bg-slate-50 p-3 text-[13px]">
          <Line label={`ChopeFix fee (${pct(a.feeBps)})`} v={`− ${sgd(a.fee)}`} muted />
          <Line label={`Rolling workmanship reserve (${pct(a.reserveBps)})`} v={`− ${sgd(a.reserve)}`} muted />
          <Line label={<b className="text-ink">{released ? 'Net paid out to contractor' : 'Contractor net on release'}</b>} v={<b className="text-teal-700">{refunded ? sgd(0) : sgd(a.net)}</b>} />
        </div>
      )}
      <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
        <span>{booking.payment.rail === 'paynow' ? 'PayNow' : 'Card hold'} · {booking.payment.ref}</span>
        {released && booking.releaseType && <span>Released by {booking.releaseType === 'auto' ? '24h auto-release' : booking.releaseType === 'ops' ? 'Ops decision' : 'customer confirmation'}</span>}
      </div>
    </div>
  );
}
function Line({ label, v, muted }: { label: React.ReactNode; v: React.ReactNode; muted?: boolean }) {
  return <div className="flex items-center justify-between gap-3"><span className={muted ? 'text-slate-500' : 'text-slate-700'}>{label}</span><span className={cx('tabular whitespace-nowrap font-semibold', muted ? 'text-slate-500' : 'text-ink')}>{v}</span></div>;
}

export function Timeline({ booking }: { booking: Booking }) {
  const evs = [...booking.events].reverse();
  return (
    <ol className="relative space-y-4 border-l-2 border-slate-100 pl-5">
      {evs.map((e, i) => (
        <li key={i} className="relative">
          <span className={cx('absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white', i === 0 ? 'bg-teal-500' : 'bg-slate-300')} />
          <div className="text-[13px] leading-snug text-slate-700">{e.message}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{e.actor} · {fmtDateTime(e.at)} SGT · {relTime(e.at)}</div>
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, right, children, className }: { title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cx('p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-[15px] font-bold text-ink">{title}</h3>{right}</div>
      {children}
    </Card>
  );
}

export function OffAppNotice() {
  return (
    <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-[13px] text-amber-900 ring-1 ring-amber-200">
      <Icon.Alert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div><b>Only in-app work is protected.</b> Extras paid by cash or direct PayNow to the contractor are <b>not covered</b> by the 30-day ChopeFix Protection warranty or dispute support. Ask your pro to log any extra item in the app.</div>
    </div>
  );
}

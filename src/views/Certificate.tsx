import type { Booking } from '../types';
import { sgd, fmtDate } from '../format';
import { Button, LogoMark, Modal, Icon } from '../components/ui';

export function CertificateModal({ booking, onClose }: { booking: Booking; onClose: () => void }) {
  const approved = booking.addons.filter((a) => a.status === 'approved');
  const download = () => {
    const el = document.getElementById('print-certificate');
    if (!el) return;
    const css = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')).map((n) => n.outerHTML).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>ChopeFix Protection ${booking.ref}</title>${css}</head><body style="background:#f1f5f9;padding:32px">${el.outerHTML}</body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = `ChopeFix-Warranty-${booking.ref}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <Modal open onClose={onClose} maxW="max-w-2xl">
      <div id="print-certificate" className="relative overflow-hidden rounded-2xl bg-white p-7 ring-1 ring-slate-200">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal-100/70" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3"><LogoMark className="h-12 w-12" /><div><div className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">ChopeFix Protection</div><div className="text-2xl font-extrabold tracking-tight text-ink">30-Day Workmanship Warranty</div></div></div>
          <div className="text-right"><div className="text-[11px] uppercase tracking-wide text-slate-400">Certificate no.</div><div className="font-mono text-sm font-bold text-ink">WTY-{booking.ref.slice(3)}</div></div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-4">
          <Info k="Customer" v={booking.customer.name} />
          <Info k="Address" v={`${booking.address.unitNo} · S(${booking.address.postalCode})`} />
          <Info k="Valid from" v={booking.releasedAt ? fmtDate(booking.releasedAt) : '-'} />
          <Info k="Valid until" v={booking.warrantyUntil ? fmtDate(booking.warrantyUntil) : '-'} />
        </div>
        <table className="relative mt-5 w-full text-sm">
          <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="pb-2">Covered work (logged in app)</th><th className="pb-2 text-right">Amount</th></tr></thead>
          <tbody>
            <tr className="border-b border-slate-100"><td className="py-2.5"><div className="font-semibold text-ink">{booking.jobTitle}</div><div className="text-xs text-slate-500">{booking.job?.scope.join(' · ')}</div></td><td className="tabular py-2.5 text-right font-semibold">{sgd(booking.amounts.base)}</td></tr>
            {approved.map((a) => <tr key={a.id} className="border-b border-slate-100"><td className="py-2.5"><div className="font-semibold text-ink">On-site add-on: {a.label}</div><div className="text-xs text-slate-500">Approved by customer in app</div></td><td className="tabular py-2.5 text-right font-semibold">{sgd(a.price)}</td></tr>)}
            <tr><td className="pt-3 font-bold text-ink">Total covered</td><td className="tabular pt-3 text-right text-lg font-extrabold text-ink">{sgd(booking.amounts.gross)}</td></tr>
          </tbody>
        </table>
        <div className="relative mt-5 grid gap-4 text-xs text-slate-600 sm:grid-cols-2">
          <div><div className="mb-1 font-bold text-ink">Performed by</div>{booking.contractor?.name} · {booking.contractor?.licenceType} ({booking.contractor?.licenceNo})<br />Job ref {booking.ref} · Photo proof on file</div>
          <div><div className="mb-1 font-bold text-ink">Terms</div>Free rework by the original contractor for workmanship defects on the items above. Excludes misuse, wear & tear, and any work or parts paid outside the ChopeFix app.</div>
        </div>
        <div className="relative mt-5 flex items-center gap-2 rounded-xl bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-800"><Icon.Shield className="h-4 w-4" />Backed by the contractor’s rolling workmanship reserve held by ChopeFix.</div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={download}>Download (.html)</Button>
        <Button onClick={() => window.print()}>Print / Save as PDF</Button>
      </div>
    </Modal>
  );
}
function Info({ k, v }: { k: string; v: string }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-slate-400">{k}</div><div className="font-semibold text-ink">{v}</div></div>;
}

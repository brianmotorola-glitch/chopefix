import type { Status, Trade } from './types';

export const sgd = (cents: number, dp = 2) => `S$${(cents / 100).toLocaleString('en-SG', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const pct = (bps: number) => `${(bps / 100).toLocaleString('en-SG', { maximumFractionDigits: 1 })}%`;

const TZ = 'Asia/Singapore';
export const fmtDateTime = (ts: number) => new Date(ts).toLocaleString('en-SG', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtDate = (ts: number) => new Date(ts).toLocaleDateString('en-SG', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-SG', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtWindowDate = (iso: string) => {
  const today = sgToday();
  const tomorrow = sgToday(1);
  if (iso === today) return 'Today';
  if (iso === tomorrow) return 'Tomorrow';
  return new Date(`${iso}T00:00:00+08:00`).toLocaleDateString('en-SG', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
};
export const sgToday = (offsetDays = 0) => new Date(Date.now() + 8 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

export function relTime(ts: number) {
  const d = Date.now() - ts;
  const m = Math.round(Math.abs(d) / 60000);
  const s = m < 1 ? 'just now' : m < 60 ? `${m} min` : m < 60 * 24 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
  if (m < 1) return s;
  return d >= 0 ? `${s} ago` : `in ${s}`;
}

export function countdown(ms: number) {
  if (ms <= 0) return '00:00:00';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export const STATUS_META: Record<Status, { label: string; tone: 'slate' | 'teal' | 'amber' | 'emerald' | 'rose' | 'sky' | 'violet' }> = {
  requested: { label: 'Finding contractor', tone: 'sky' },
  accepted: { label: 'Contractor assigned', tone: 'violet' },
  in_progress: { label: 'On site', tone: 'amber' },
  awaiting_confirmation: { label: 'Awaiting your OK', tone: 'teal' },
  completed: { label: 'Completed · Protected', tone: 'emerald' },
  disputed: { label: 'Payout paused', tone: 'rose' },
  refunded: { label: 'Refunded', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const TRADE_META: Record<Trade, { color: string; bg: string; ring: string }> = {
  Plumbing: { color: 'text-sky-700', bg: 'bg-sky-50', ring: 'ring-sky-200' },
  Electrical: { color: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200' },
  Handyman: { color: 'text-teal-700', bg: 'bg-teal-50', ring: 'ring-teal-200' },
};

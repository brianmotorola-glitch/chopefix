import { createContext, useCallback, useContext, useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react';
import type { Status, Trade } from '../types';
import { STATUS_META, TRADE_META, countdown, fmtDateTime } from '../format';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* ------------------------------- brand mark ------------------------------- */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill="#0f2a33" />
      <path d="M14 30 L32 15 L50 30" fill="none" stroke="#5eead4" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 34 L28.5 42.5 L45 26" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="47.5" cy="46.5" r="6.5" fill="#f59e0b" />
    </svg>
  );
}
export function Logo({ dark = false, sub }: { dark?: boolean; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className={cx('text-[19px] font-extrabold tracking-tight', dark ? 'text-white' : 'text-ink')}>
          Chope<span className="text-teal-500">Fix</span>
        </div>
        {sub && <div className={cx('mt-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]', dark ? 'text-teal-200/80' : 'text-slate-500')}>{sub}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- icons ---------------------------------- */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  Plumbing: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M5 9h7a3 3 0 0 1 3 3v2" /><path d="M5 6v6" /><path d="M15 17.5c0 1.4-1 2.5-2 2.5s-2-1.1-2-2.5S13 14 13 14s2 2.1 2 3.5Z" /><path d="M8 6h-6M17 12h3" /></svg>,
  Electrical: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>,
  Handyman: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" /></svg>,
  Shield: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg>,
  Lock: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>,
  Clock: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  Camera: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  Pin: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>,
  Check: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="m5 12 5 5 9-10" /></svg>,
  X: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  Search: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  Star: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></svg>,
  Alert: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></svg>,
  Plus: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M12 5v14M5 12h14" /></svg>,
  Wallet: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0 13-3v3" /><circle cx="16.5" cy="13.5" r="1.3" /></svg>,
  Wrench: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6Z" /></svg>,
  Doc: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></svg>,
  Bolt: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>,
  Upload: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v4h16v-4" /></svg>,
  Sparkle: (p: { className?: string }) => <svg viewBox="0 0 24 24" className={p.className} {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>,
};
export function TradeIcon({ trade, className = 'h-5 w-5' }: { trade: Trade; className?: string }) {
  const I = Icon[trade];
  return <I className={className} />;
}
export function TradeChip({ trade }: { trade: Trade }) {
  const m = TRADE_META[trade];
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', m.bg, m.color, m.ring)}><TradeIcon trade={trade} className="h-3.5 w-3.5" />{trade}</span>;
}

/* -------------------------------- badges ---------------------------------- */
const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
  ink: 'bg-ink text-white ring-ink',
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = 'slate', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}
export function ComplianceBadge({ text }: { text: string }) {
  return <Badge tone={text.startsWith('EMA') ? 'amber' : text.startsWith('PUB') ? 'sky' : 'slate'}><Icon.Shield className="h-3.5 w-3.5" />{text}</Badge>;
}

/* -------------------------------- buttons --------------------------------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success'; size?: 'sm' | 'md' | 'lg'; loading?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: 'bg-ink text-white hover:bg-ink-2 shadow-sm shadow-ink/20',
    accent: 'bg-amber-500 text-ink hover:bg-amber-400 shadow-sm shadow-amber-500/30',
    secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50',
    success: 'bg-teal-600 text-white hover:bg-teal-500 shadow-sm shadow-teal-600/25',
  }[variant];
  const s = { sm: 'h-8 px-3 text-[13px] rounded-lg', md: 'h-10 px-4 text-sm rounded-xl', lg: 'h-12 px-5 text-[15px] rounded-xl' }[size];
  return (
    <button {...rest} disabled={disabled || loading} className={cx('inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50', v, s, className)}>
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl bg-white ring-1 ring-slate-200/80 shadow-[0_1px_2px_rgba(15,42,51,.04),0_8px_24px_-12px_rgba(15,42,51,.12)]', className)}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
export const inputCls = 'w-full rounded-xl border-0 bg-white px-3.5 py-2.5 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500 outline-none';

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('inline-flex rounded-xl bg-slate-100 p-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1.5 text-[13px] font-semibold transition', value === o.value ? 'bg-white text-ink shadow-sm' : 'text-slate-500 hover:text-slate-800')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------- modal & drawer ------------------------------ */
export function Drawer({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('drawer-panel relative flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl md:max-h-none md:rounded-none md:rounded-l-3xl', wide ? 'md:max-w-2xl' : 'md:max-w-[460px]')}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 text-base font-bold text-ink">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><Icon.X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
export function Modal({ open, onClose, title, children, maxW = 'max-w-lg' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; maxW?: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx('animate-rise relative max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl', maxW)}>
        {title && <div className="mb-4 flex items-start justify-between gap-4"><div className="text-lg font-bold text-ink">{title}</div><button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><Icon.X className="h-5 w-5" /></button></div>}
        {children}
      </div>
    </div>
  );
}

/* --------------------------------- toast ---------------------------------- */
type ToastT = { id: number; text: string; tone: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastT[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className={cx('animate-rise pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl', t.tone === 'ok' ? 'bg-ink text-white' : 'bg-rose-600 text-white')}>
            {t.tone === 'ok' ? <Icon.Check className="h-4 w-4 text-teal-300" /> : <Icon.Alert className="h-4 w-4" />}{t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------ time helpers ------------------------------ */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}
export function Countdown({ until, className }: { until: number; className?: string }) {
  const now = useNow();
  return <span className={cx('tabular font-mono', className)}>{countdown(until - now)}</span>;
}

/* ------------------------------- lifecycle -------------------------------- */
const STEPS = [
  { key: 'requested', label: 'Booked & held' },
  { key: 'accepted', label: 'Pro assigned' },
  { key: 'in_progress', label: 'On site' },
  { key: 'awaiting_confirmation', label: 'Photo proof' },
  { key: 'completed', label: 'Paid & protected' },
];
export function Stepper({ status, compact }: { status: Status; compact?: boolean }) {
  const idx = status === 'disputed' ? 3 : Math.max(0, STEPS.findIndex((s) => s.key === status));
  const bad = status === 'cancelled' || status === 'refunded';
  return (
    <ol className="flex w-full items-start">
      {STEPS.map((s, i) => {
        const done = !bad && (i < idx || status === 'completed');
        const cur = !bad && i === idx && status !== 'completed';
        const disputed = status === 'disputed' && i === idx;
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={cx('absolute top-[12px] h-[3px] rounded', done || cur ? 'bg-teal-500' : 'bg-slate-200')} style={{ left: 'calc(-50% + 16px)', right: 'calc(50% + 16px)' }} />}
            <span className={cx('relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full text-[11px] font-bold ring-4 ring-white',
              disputed ? 'bg-rose-500 text-white' : done ? 'bg-teal-500 text-white' : cur ? 'bg-amber-400 text-ink' : 'bg-slate-200 text-slate-500')}>
              {disputed ? '!' : done ? <Icon.Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            {!compact && <span className={cx('mt-1.5 px-0.5 text-[11px] font-semibold leading-tight', done || cur ? 'text-slate-800' : 'text-slate-400')}>{disputed ? 'Paused' : s.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------- photos --------------------------------- */
export function PhotoTile({ url, kind, takenAt, lat, lng, onOpen }: { url: string; kind: string; takenAt: number; lat: number | null; lng: number | null; onOpen?: () => void }) {
  const tone = kind === 'before' ? 'bg-amber-500' : kind === 'after' ? 'bg-teal-600' : 'bg-sky-600';
  return (
    <button type="button" onClick={onOpen} className="group relative block aspect-[16/10] w-full overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
      <img src={url} alt={`${kind} photo`} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
      <span className={cx('absolute left-2 top-2 rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-white', tone)}>{kind}</span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2 pb-1.5 pt-5 text-left font-mono text-[10px] leading-tight text-white">
        {fmtDateTime(takenAt)} SGT{lat != null && lng != null && <><br />GPS {lat.toFixed(4)}, {lng.toFixed(4)}</>}
      </span>
    </button>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <div className="font-semibold text-slate-800">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Avatar({ initials, trade, size = 'md', verified }: { initials: string; trade?: Trade; size?: 'sm' | 'md' | 'lg'; verified?: boolean }) {
  const s = { sm: 'h-8 w-8 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-14 w-14 text-base' }[size];
  const bg = trade === 'Electrical' ? 'from-amber-400 to-orange-500' : trade === 'Plumbing' ? 'from-sky-400 to-cyan-600' : 'from-teal-400 to-emerald-600';
  return (
    <span className="relative inline-flex shrink-0">
      <span className={cx('inline-flex items-center justify-center rounded-2xl bg-gradient-to-br font-bold text-white', bg, s)}>{initials}</span>
      {verified && <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-teal-500 text-white ring-2 ring-white"><Icon.Check className="h-3 w-3" /></span>}
    </span>
  );
}

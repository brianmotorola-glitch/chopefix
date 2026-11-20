import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { DemoAccount, Settings, User } from './types';
import { Logo, Button, cx, Icon, useToast, Avatar } from './components/ui';
import { AuthModal } from './views/AuthModal';
import { CustomerApp } from './views/CustomerApp';
import { ContractorApp } from './views/ContractorApp';
import { AdminApp } from './views/AdminApp';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [demo, setDemo] = useState<{ password: string; accounts: DemoAccount[] }>({ password: '', accounts: [] });
  const [authOpen, setAuthOpen] = useState<false | 'login' | 'register'>(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      api.get<{ user: User | null }>('/api/auth/me'),
      api.get<Settings>('/api/settings'),
      api.get<{ password: string; accounts: DemoAccount[] }>('/api/demo/accounts'),
    ]).then(async ([me, s, d]) => {
      setSettings(s);
      setDemo(d);
      // First visit in demo mode: start as the demo customer so the app is immediately explorable.
      if (!me.user && s.demoMode && !sessionStorage.getItem('cf_logged_out')) {
        const cust = d.accounts.find((a) => a.role === 'customer');
        if (cust) { const r = await api.post<{ user: User }>('/api/auth/demo', { email: cust.email }); setUser(r.user); setReady(true); return; }
      }
      setUser(me.user);
      setReady(true);
    }).catch(() => setReady(true));
  }, []);

  const switchTo = useCallback(async (email: string) => {
    setSwitching(email);
    try {
      const r = await api.post<{ user: User }>('/api/auth/demo', { email });
      setUser(r.user);
      sessionStorage.removeItem('cf_logged_out');
      window.scrollTo({ top: 0 });
    } catch (e) { toast((e as Error).message, 'err'); } finally { setSwitching(null); }
  }, [toast]);

  const logout = async () => {
    await api.post('/api/auth/logout');
    sessionStorage.setItem('cf_logged_out', '1');
    setUser(null);
  };

  if (!ready || !settings) return <div className="flex min-h-screen items-center justify-center"><Logo sub="Loading" /></div>;

  const customer = demo.accounts.find((a) => a.role === 'customer');
  const contractors = demo.accounts.filter((a) => a.role === 'contractor');
  const admin = demo.accounts.find((a) => a.role === 'admin');
  const roleKey = user?.role ?? 'guest';

  return (
    <div className="min-h-screen">
      {settings.demoMode && demo.accounts.length > 0 && (
        <div className="bg-ink text-white">
          <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2 scrollbar-none sm:px-6">
            <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-teal-300"><Icon.Sparkle className="h-3.5 w-3.5" />Demo · switch role</span>
            {customer && <RolePill active={user?.email === customer.email} loading={switching === customer.email} onClick={() => switchTo(customer.email)}>Customer · {customer.name.split(' ')[0]}</RolePill>}
            <span className="mx-1 h-4 w-px shrink-0 bg-white/15" />
            {contractors.map((c) => (
              <RolePill key={c.email} active={user?.email === c.email} loading={switching === c.email} onClick={() => switchTo(c.email)}>
                <span className="opacity-60">{c.trade === 'Plumbing' ? 'Plumber' : c.trade === 'Electrical' ? 'LEW' : 'Handyman'}</span> {c.name}
              </RolePill>
            ))}
            <span className="mx-1 h-4 w-px shrink-0 bg-white/15" />
            {admin && <RolePill active={user?.email === admin.email} loading={switching === admin.email} onClick={() => switchTo(admin.email)}>Ops Admin</RolePill>}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Logo sub={roleKey === 'contractor' ? 'Pro Partner' : roleKey === 'admin' ? 'Ops Console' : 'Fixed-price home fixes'} />
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 ring-1 ring-teal-200 lg:flex">
              <Icon.Lock className="h-3.5 w-3.5" />Held payout · {settings.autoReleaseHours}h auto-release · {settings.warrantyDays}-day protection
            </div>
            {user ? (
              <div className="flex items-center gap-2">
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-semibold leading-tight text-ink">{user.name}</div>
                  <div className="text-[11px] capitalize leading-tight text-slate-500">{user.role === 'admin' ? 'Ops admin' : user.contractor ? `${user.contractor.trade} pro` : 'Homeowner'}</div>
                </div>
                <Avatar initials={user.contractor?.initials ?? user.name.split(' ').map((p) => p[0]).join('').slice(0, 2)} trade={user.contractor?.trade} size="sm" />
                <Button variant="ghost" size="sm" onClick={logout}>Log out</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAuthOpen('login')}>Log in</Button>
                <Button size="sm" onClick={() => setAuthOpen('register')}>Sign up</Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6">
        {(!user || user.role === 'customer') && <CustomerApp key={user?.id ?? 'guest'} user={user} settings={settings} onNeedAuth={() => setAuthOpen('register')} />}
        {user?.role === 'contractor' && <ContractorApp key={user.id} user={user} settings={settings} demoContractors={contractors} onSwitch={switchTo} />}
        {user?.role === 'admin' && <AdminApp key={user.id} settings={settings} />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© 2026 ChopeFix · Singapore MVP. Payments are simulated holds; no real card or PayNow funds move.</span>
          <span>Electrical jobs by EMA-licensed LEWs · Plumbing within PUB simple plumbing scope.</span>
        </div>
      </footer>

      <AuthModal mode={authOpen} onClose={() => setAuthOpen(false)} onMode={setAuthOpen} demoPassword={demo.password}
        onAuthed={(u) => { setUser(u); setAuthOpen(false); sessionStorage.removeItem('cf_logged_out'); toast(`Welcome, ${u.name.split(' ')[0]}!`); }} />
    </div>
  );
}

function RolePill({ active, loading, onClick, children }: { active: boolean; loading: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx('shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold transition', active ? 'bg-amber-400 text-ink' : 'bg-white/10 text-white/85 hover:bg-white/20')}>
      {loading ? '…' : children}
    </button>
  );
}

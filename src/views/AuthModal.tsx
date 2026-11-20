import { useState } from 'react';
import { api } from '../api';
import type { Trade, User } from '../types';
import { Button, Field, inputCls, Modal, Segmented } from '../components/ui';

export function AuthModal({ mode, onClose, onMode, onAuthed, demoPassword }: { mode: false | 'login' | 'register'; onClose: () => void; onMode: (m: 'login' | 'register') => void; onAuthed: (u: User) => void; demoPassword: string }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', role: 'customer' as 'customer' | 'contractor', trade: 'Handyman' as Trade, licenceNo: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = mode === 'login'
        ? await api.post<{ user: User }>('/api/auth/login', { email: f.email, password: f.password })
        : await api.post<{ user: User }>('/api/auth/register', f);
      onAuthed(r.user);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!mode} onClose={onClose} title={mode === 'login' ? 'Log in to ChopeFix' : 'Create your ChopeFix account'} maxW="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <>
            <Segmented value={f.role} onChange={(role) => setF({ ...f, role })} options={[{ value: 'customer', label: 'I need a fix' }, { value: 'contractor', label: 'I’m a contractor' }]} className="w-full [&>button]:flex-1" />
            <Field label="Full name"><input className={inputCls} value={f.name} onChange={set('name')} required placeholder="Tan Mei Ling" /></Field>
            <Field label="Mobile (optional)"><input className={inputCls} value={f.phone} onChange={set('phone')} placeholder="+65 9xxx xxxx" /></Field>
            {f.role === 'contractor' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Trade"><select className={inputCls} value={f.trade} onChange={set('trade')}><option>Plumbing</option><option>Electrical</option><option>Handyman</option></select></Field>
                <Field label={f.trade === 'Electrical' ? 'EMA LEW licence no.' : 'Licence / ID no.'}><input className={inputCls} value={f.licenceNo} onChange={set('licenceNo')} placeholder="e.g. LEW-E8-…" /></Field>
              </div>
            )}
          </>
        )}
        <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></Field>
        <Field label="Password" hint={mode === 'register' ? 'At least 8 characters. Stored as a salted scrypt hash.' : undefined}>
          <input className={inputCls} type="password" value={f.password} onChange={set('password')} required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </Field>
        {f.role === 'contractor' && mode === 'register' && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">New contractor accounts start as <b>verification pending</b>. Ops verifies licence & ID before you can accept jobs.</p>}
        {err && <p className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-700">{err}</p>}
        <Button type="submit" className="w-full" size="lg" loading={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</Button>
        <p className="text-center text-sm text-slate-500">
          {mode === 'login' ? <>New here? <button type="button" className="font-semibold text-teal-700" onClick={() => onMode('register')}>Create an account</button></>
            : <>Already have an account? <button type="button" className="font-semibold text-teal-700" onClick={() => onMode('login')}>Log in</button></>}
        </p>
        {demoPassword && mode === 'login' && <p className="text-center text-xs text-slate-400">Demo accounts: rachel@ / weiming@ / farid@ / jason@ / ops@chopefix.demo · password <code>{demoPassword}</code></p>}
      </form>
    </Modal>
  );
}

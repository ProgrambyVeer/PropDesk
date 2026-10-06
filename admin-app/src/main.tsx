import React, { createContext, useContext, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { Bell, BarChart3, Briefcase, Building2, CalendarClock, ClipboardList, Cog, History, LayoutDashboard, LogOut, MapPin, Search, Shield, Sparkles, Trash2, User, UserCog, Users } from 'lucide-react';
import clsx from 'clsx';
import { ApiError, get, post, token } from './lib/api';
import { Btn, In } from './ui';
import * as P from './pages';
import './index.css';

type Admin = { id: string; name: string; email: string; role: string; permissions: string[] };
const Ctx = createContext<{ admin: Admin | null | false; setAdmin: (a: Admin | false) => void; can: (p: string) => boolean }>(null as any);
export const useAdmin = () => useContext(Ctx);

const NAV = [
  ['/', 'Dashboard', LayoutDashboard], ['/pcs', 'PCs', Users], ['/clients', 'Clients', User], ['/properties', 'Properties', Building2], ['/requirements', 'Requirements', ClipboardList],
  ['/deals', 'Deals', Briefcase], ['/follow-ups', 'Follow-ups', CalendarClock], ['/notifications', 'Notifications', Bell], ['/analytics', 'Analytics', BarChart3], ['/activity', 'Activity Logs', History],
  ['/bin', 'Bin', Trash2], ['/locations', 'Locations', MapPin], ['/amenities', 'Amenities', Sparkles], ['/settings', 'System Settings', Cog], ['/users', 'Admin Users', UserCog], ['/profile', 'Profile', Shield],
] as const;

function Layout() {
  const { admin, setAdmin } = useAdmin();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  if (!admin) return null;
  const logout = async () => { try { await post('/auth/logout'); } catch { /* */ } token.clear(); setAdmin(false); };
  return (
    <div className="min-h-screen bg-slate-100 pl-64">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col bg-[#0B132B] text-slate-300">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white"><Shield className="h-4 w-4" /></div><div><p className="text-sm font-extrabold text-white">PropDesk</p><p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">Super Admin</p></div></div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">{NAV.map(([to, label, I]) => (
          <NavLink key={to} to={to} end={to === '/'} data-testid={`admin-nav-${label.toLowerCase().replace(/\s+/g, '-')}`} className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors', isActive ? 'bg-blue-700 text-white' : 'hover:bg-white/5 hover:text-white')}><I className="h-4 w-4" />{label}</NavLink>))}
          <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-semibold text-red-300 hover:bg-white/5" data-testid="admin-logout-btn"><LogOut className="h-4 w-4" />Logout</button></nav>
      </aside>
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
        <form onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`); }} className="relative w-[420px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><In className="w-full pl-9" placeholder="Search PCs, clients, PROP-…, REQ-…, DEAL-…, phone, location" value={q} onChange={(e) => setQ(e.target.value)} data-testid="admin-global-search-input" /></form>
        <div className="flex items-center gap-4"><button onClick={() => nav('/notifications')} data-testid="admin-header-notifications"><Bell className="h-5 w-5 text-slate-500" /></button>
          <button onClick={() => nav('/profile')} className="text-right" data-testid="admin-profile-btn"><p className="text-sm font-bold">{admin.name}</p><p className="text-[11px] font-semibold text-blue-700">{admin.role.replace(/_/g, ' ')}</p></button></div>
      </header>
      <main className="p-8"><Outlet /></main>
    </div>
  );
}

function Login() {
  const { setAdmin } = useAdmin();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await post('/auth/login', { email, password }); token.set(r.token); setAdmin(r.admin); } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B132B] p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl" data-testid="admin-login-form">
        <div className="mb-6 flex items-center gap-2"><Shield className="h-6 w-6 text-blue-700" /><p className="font-extrabold">PropDesk Super Admin</p></div>
        <h1 className="text-2xl font-extrabold tracking-tight">Administrator sign in</h1><p className="mt-1 text-sm text-slate-500">Restricted access. All activity is audited.</p>
        <label className="mt-6 block text-xs font-bold text-slate-600">Email<In type="email" className="mt-1 w-full" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="admin-email-input" required /></label>
        <label className="mt-4 block text-xs font-bold text-slate-600">Password<In type="password" className="mt-1 w-full" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="admin-password-input" required /></label>
        {err && <p className="mt-3 text-sm font-medium text-red-600" data-testid="admin-login-error">{err}</p>}
        <Btn className="mt-6 h-10 w-full" loading={busy} data-testid="admin-login-btn">Sign in</Btn>
      </form>
    </div>
  );
}

function App() {
  const [admin, setAdmin] = useState<Admin | null | false>(token.get() ? null : false);
  useEffect(() => {
    if (token.get()) get('/auth/me').then(setAdmin).catch(() => setAdmin(false));
    const exp = () => { setAdmin(false); toast.error('Admin session expired'); };
    window.addEventListener('admin:expired', exp); return () => window.removeEventListener('admin:expired', exp);
  }, []);
  const can = (p: string) => !!admin && admin.permissions.includes(p);
  return (
    <Ctx.Provider value={{ admin, setAdmin, can }}>
      {admin === null ? <div className="p-10 text-slate-500">Loading…</div> : !admin ? <Login /> : (
        <Routes><Route element={<Layout />}>
          <Route path="/" element={<P.Dashboard />} /><Route path="/search" element={<P.SearchPage />} />
          <Route path="/pcs" element={<P.Pcs />} /><Route path="/pcs/:id" element={<P.PcDetail />} />
          <Route path="/clients" element={<P.Clients />} /><Route path="/properties" element={<P.Properties />} /><Route path="/requirements" element={<P.Requirements />} />
          <Route path="/deals" element={<P.Deals />} /><Route path="/follow-ups" element={<P.FollowUps />} /><Route path="/notifications" element={<P.Notifications />} />
          <Route path="/:entity/:id" element={<P.RecordDetail />} />
          <Route path="/analytics" element={<P.Analytics />} /><Route path="/activity" element={<P.Activity />} /><Route path="/bin" element={<P.Bin />} />
          <Route path="/locations" element={<P.Locations />} /><Route path="/amenities" element={<P.Amenities />} /><Route path="/settings" element={<P.Settings />} />
          <Route path="/users" element={<P.AdminUsers />} /><Route path="/profile" element={<P.Profile />} /><Route path="*" element={<Navigate to="/" />} />
        </Route></Routes>)}
    </Ctx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><App /><Toaster position="top-right" richColors /></BrowserRouter></React.StrictMode>,
);

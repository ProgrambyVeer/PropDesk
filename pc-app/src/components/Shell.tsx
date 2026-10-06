import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Bell, Briefcase, Building2, CalendarClock, HelpCircle, History, Home, LogOut, Search, Settings, Trash2, User, Users, BarChart3, Landmark } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { fileUrl, request } from '../lib/api';
import { initials } from '../lib/format';

const NAV = [
  { to: '/', label: 'Home', icon: Home, id: 'home' },
  { to: '/properties', label: 'Properties', icon: Building2, id: 'properties' },
  { to: '/clients', label: 'Clients', icon: Users, id: 'clients' },
  { to: '/follow-ups', label: 'Follow Ups', icon: CalendarClock, id: 'followups' },
  { to: '/deals', label: 'Deals', icon: Briefcase, id: 'deals' },
];
const MENU = [
  { to: '/profile', label: 'My Profile', icon: User }, { to: '/company', label: 'Company Details', icon: Landmark }, { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/notifications', label: 'Notifications', icon: Bell }, { to: '/analytics', label: 'Analytics', icon: BarChart3 }, { to: '/bin', label: 'Bin', icon: Trash2 },
  { to: '/activity', label: 'Activity Logs', icon: History }, { to: '/help', label: 'Help', icon: HelpCircle },
];

function useNotificationPoller() {
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await request<any[]>('/notifications', { query: { unread: 'true', pageSize: 20 } });
        setUnread(r.meta?.unread ?? 0);
        if (seen.current) {
          for (const n of r.data.filter((x) => !seen.current!.has(x.id))) {
            toast(n.title, { description: n.body });
            if ('Notification' in window && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
          }
        }
        seen.current = new Set(r.data.map((x) => x.id));
      } catch { /* offline */ }
    };
    poll();
    const t = setInterval(poll, 30000);
    window.addEventListener('notifications:changed', poll);
    return () => { clearInterval(t); window.removeEventListener('notifications:changed', poll); };
  }, []);
  return unread;
}

export default function Shell() {
  const { user, logout } = useAuth();
  const [menu, setMenu] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  const unread = useNotificationPoller();
  useEffect(() => setMenu(false), [loc.pathname]);
  if (!user) return null;
  return (
    <div className="min-h-screen bg-slate-50 lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white px-4 py-6 lg:flex">
        <Logo />
        <nav className="mt-8 space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} data-testid={`side-nav-${n.id}`} className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors', isActive ? 'bg-navy text-white' : 'text-slate-600 hover:bg-slate-100')}>
              <n.icon className="h-[18px] w-[18px]" />{n.label}
            </NavLink>
          ))}
          <NavLink to="/analytics" className={({ isActive }) => clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold', isActive ? 'bg-navy text-white' : 'text-slate-600 hover:bg-slate-100')}><BarChart3 className="h-[18px] w-[18px]" />Analytics</NavLink>
        </nav>
      </aside>
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <div className="lg:hidden"><Logo /></div>
          <div className="hidden text-sm font-medium text-slate-500 lg:block">{user.profile?.companyName || 'Property Consultant'}</div>
          <div className="flex items-center gap-1">
            <button onClick={() => nav('/search')} className="rounded-full p-2.5 text-slate-600 hover:bg-slate-100" data-testid="header-search-btn" aria-label="Search"><Search className="h-5 w-5" /></button>
            <button onClick={() => nav('/notifications')} className="relative rounded-full p-2.5 text-slate-600 hover:bg-slate-100" data-testid="header-notifications-btn" aria-label="Notifications">
              <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[18px] text-white" data-testid="unread-count">{unread}</span>}
            </button>
            <button onClick={() => setMenu(!menu)} data-testid="profile-avatar-btn" className="ml-1 flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-navy text-xs font-bold text-white ring-2 ring-white shadow">
              {user.profile?.photoUrl ? <img src={fileUrl(user.profile.photoUrl)} alt="" className="h-full w-full object-cover" /> : initials(user.name || user.phone)}
            </button>
          </div>
        </div>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute right-4 top-14 z-50 w-64 animate-up rounded-2xl border border-slate-200 bg-white p-2 shadow-lift" data-testid="profile-menu">
              <div className="border-b border-slate-100 px-3 pb-3 pt-2"><p className="font-bold">{user.name || 'Your name'}</p><p className="text-xs text-slate-500">+91 {user.phone} · {user.pcCode}</p></div>
              {MENU.map((m) => (
                <button key={m.to} onClick={() => nav(m.to)} data-testid={`menu-${m.label.toLowerCase().replace(/\s+/g, '-')}`} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"><m.icon className="h-4 w-4 text-slate-400" />{m.label}</button>
              ))}
              <button onClick={logout} data-testid="menu-logout" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />Logout</button>
            </div>
          </>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 lg:pb-12"><Outlet /></main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-xl pb-safe lg:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} data-testid={`bottom-nav-${n.id}`} className={({ isActive }) => clsx('flex flex-col items-center justify-center gap-1 text-[10.5px] font-bold uppercase tracking-wide transition-colors', isActive ? 'text-brand' : 'text-slate-400')}>
              <n.icon className="h-[22px] w-[22px]" strokeWidth={2} />{n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export const Logo = () => (
  <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy text-white"><Building2 className="h-4 w-4" /></div><span className="text-[17px] font-extrabold tracking-tight">Prop<span className="text-brand">Desk</span></span></div>
);

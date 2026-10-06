import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { get, post, token } from './api';

export interface PcUser { id: string; pcCode: string; phone: string; name: string; email?: string | null; status: string; onboarded: boolean; profile?: any }
interface Ctx { user: PcUser | null | false; setUser: (u: PcUser) => void; login: (t: string, u: PcUser) => void; logout: () => Promise<void>; refresh: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PcUser | null | false>(token.get() ? null : false);
  const refresh = async () => { try { setUser(await get('/auth/me')); } catch { setUser(false); } };
  useEffect(() => {
    if (token.get()) refresh();
    const expired = () => { setUser(false); toast.error('Session expired. Please log in again.'); };
    const blocked = (e: Event) => { setUser(false); toast.error((e as CustomEvent).detail || 'Access blocked'); };
    window.addEventListener('auth:expired', expired); window.addEventListener('auth:blocked', blocked);
    return () => { window.removeEventListener('auth:expired', expired); window.removeEventListener('auth:blocked', blocked); };
  }, []);
  const login = (t: string, u: PcUser) => { token.set(t); setUser(u); };
  const logout = async () => { try { await post('/auth/logout'); } catch { /* ignore */ } token.clear(); setUser(false); };
  return <AuthCtx.Provider value={{ user, setUser, login, logout, refresh }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

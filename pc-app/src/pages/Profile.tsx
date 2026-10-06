import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera } from 'lucide-react';
import { ApiError, fileUrl, patch, upload } from '../lib/api';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import { Button, Card, Field, Input, Textarea } from '../components/ui';

export default function Profile({ section = 'profile' }: { section?: 'profile' | 'company' | 'settings' }) {
  const { user, setUser, logout } = useAuth();
  const [f, setF] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (user) setF({ name: user.name, email: user.email || '', ...(user.profile || {}), areas: (user.profile?.areasOfOperation || []).join(', ') }); }, [user]);
  if (!user) return null;
  const save = async () => {
    setBusy(true); setErrors({});
    try {
      const u = await patch('/profile', { name: f.name, email: f.email, companyName: f.companyName, reraNumber: f.reraNumber, officeAddress: f.officeAddress, whatsappNumber: f.whatsappNumber, companyWebsite: f.companyWebsite, gstNumber: f.gstNumber, areasOfOperation: String(f.areas || '').split(',').map((s) => s.trim()).filter(Boolean) });
      setUser(u); toast.success('Profile saved');
    } catch (e) { setErrors((e as ApiError).fieldErrors); toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const photo = async (files: FileList | null) => { if (!files?.[0]) return; try { const r = await upload('/profile/photo', 'photo', [files[0]]); setUser({ ...user, profile: { ...user.profile, photoUrl: r.photoUrl } }); toast.success('Photo updated'); } catch (e) { toast.error((e as Error).message); } };
  const inp = (k: string, label: string, ph = '') => <Field label={label} error={errors[k]}><Input value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={ph} data-testid={`profile-${k}-input`} /></Field>;
  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid={`${section}-page`}>
      <h1 className="text-3xl font-extrabold tracking-tight">{section === 'company' ? 'Company Details' : section === 'settings' ? 'Settings' : 'My Profile'}</h1>
      {section === 'settings' ? <Card className="space-y-4 p-5">
        <p className="text-sm text-slate-600">Login is secured with phone OTP. Signed in as <b>+91 {user.phone}</b> ({user.pcCode}).</p>
        <Button variant="secondary" onClick={async () => { if ('Notification' in window) toast(await Notification.requestPermission()); }} data-testid="settings-notifications-btn">Enable browser notifications</Button>
        <Button variant="danger" onClick={logout} data-testid="settings-logout-btn">Logout</Button>
      </Card> : <Card className="space-y-4 p-5">
        {section === 'profile' && <>
          <div className="flex items-center gap-4"><button onClick={() => file.current?.click()} className="relative h-20 w-20 overflow-hidden rounded-2xl bg-navy text-xl font-bold text-white" data-testid="profile-photo-btn">{user.profile?.photoUrl ? <img src={fileUrl(user.profile.photoUrl)} alt="" className="h-full w-full object-cover" /> : initials(user.name || user.phone)}<span className="absolute bottom-1 right-1 rounded-full bg-white p-1 text-navy"><Camera className="h-3 w-3" /></span></button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => photo(e.target.files)} /><div><p className="font-bold">{user.name || 'Add your name'}</p><p className="text-sm text-slate-500">+91 {user.phone}</p></div></div>
          {inp('name', 'Name')}<Field label="Phone"><Input value={`+91 ${user.phone}`} disabled /></Field>{inp('email', 'Email', 'you@company.com')}{inp('whatsappNumber', 'WhatsApp Number')}
          <Field label="Areas of Operation" hint="Comma separated"><Input value={f.areas || ''} onChange={(e) => setF({ ...f, areas: e.target.value })} placeholder="Whitefield, Varthur" data-testid="profile-areas-input" /></Field>
        </>}
        {inp('companyName', 'Company Name')}{inp('reraNumber', 'RERA Number')}
        <Field label="Office Address"><Textarea value={f.officeAddress || ''} onChange={(e) => setF({ ...f, officeAddress: e.target.value })} data-testid="profile-officeAddress-input" /></Field>
        {section === 'company' && <>{inp('companyWebsite', 'Website')}{inp('gstNumber', 'GST Number')}</>}
        <Button onClick={save} loading={busy} data-testid="profile-save-btn">Save</Button>
      </Card>}
    </div>
  );
}

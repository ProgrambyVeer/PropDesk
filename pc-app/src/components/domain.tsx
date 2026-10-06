import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, MapPin, Ruler, Share2, Link2, Pencil, Trash2, Eye, MessageCircle } from 'lucide-react';
import { ApiError, del, fileUrl, get, post } from '../lib/api';
import { useAction, useDebounced, useFetch } from '../lib/hooks';
import { ago, dims, human, inr, toLocalInput, txLabel, FU_TYPES, STAGE_TONE } from '../lib/format';
import { Badge, Button, Card, Chips, Field, Input, Mono, Select, Sheet, Textarea } from './ui';

export function SharedBadge() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider text-white shadow-sm" data-testid="shared-indicator"><span className="h-1.5 w-1.5 rounded-full bg-white" />Shared</span>;
}

export function PropertyCard({ p, onChanged }: { p: any; onChanged?: () => void }) {
  const nav = useNavigate();
  const [share, setShare] = useState(false);
  const [link, setLink] = useState(false);
  const owner = p.access !== 'VIEW_ONLY';
  const remove = async () => {
    if (!confirm(`Move ${p.code} to Bin?`)) return;
    await del(`/properties/${p.id}`); toast.success(`${p.code} moved to Bin`); onChanged?.();
  };
  return (
    <div className="animate-up" data-testid={`property-card-${p.code}`}>
      {p.isShared && <div className="mb-1.5"><SharedBadge /></div>}
      <Card className="overflow-hidden transition-shadow hover:shadow-lift">
        <Link to={`/properties/${p.id}`} className="block">
          <div className="relative aspect-[16/9] bg-slate-100">
            {p.photos?.[0] ? <img src={fileUrl(p.photos[0].url)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-slate-300"><Building2 className="h-10 w-10" /></div>}
            <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-2 py-1 backdrop-blur"><Mono>{p.code}</Mono></div>
            {p.dealStatus && <Badge tone={STAGE_TONE[p.dealStatus]} className="absolute right-3 top-3 bg-white/95">{human(p.dealStatus)}</Badge>}
          </div>
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <span>{human(p.category)}</span>·<span>{p.subCategory ? `${p.subCategory} · ` : ''}{p.subtype}</span>{p.bhk ? <>·<span>{p.bhk} BHK</span></> : null}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">{p.transactions?.map((t: any) => <span key={t.kind} className="text-lg font-extrabold tracking-tight">{txLabel(t)}</span>)}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-500">
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.location}</span>
              {p.area ? <span>{Math.round(p.area).toLocaleString('en-IN')} sqft</span> : null}
              <span className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />{dims(p)}</span>
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
              <span>{p.interestedClients ?? 0} interested client{p.interestedClients === 1 ? '' : 's'}</span>
              <span>{p.transactions?.find((t: any) => t.availableDate) ? `Available ${new Date(p.transactions.find((t: any) => t.availableDate).availableDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : p.status === 'ACTIVE' ? 'Available now' : human(p.status)}</span>
            </div>
          </div>
        </Link>
        <div className="grid grid-cols-5 border-t border-slate-100 text-slate-500">
          <IconAct icon={Eye} label="View" onClick={() => nav(`/properties/${p.id}`)} id={`view-${p.code}`} />
          <IconAct icon={Pencil} label="Edit" onClick={() => nav(`/properties/${p.id}/edit`)} disabled={!owner} id={`edit-${p.code}`} />
          <IconAct icon={Share2} label="Share" onClick={() => setShare(true)} disabled={!owner} id={`share-${p.code}`} />
          <IconAct icon={Link2} label="Link" onClick={() => setLink(true)} id={`link-${p.code}`} />
          <IconAct icon={Trash2} label="Delete" onClick={remove} disabled={!owner} id={`delete-${p.code}`} />
        </div>
      </Card>
      <ShareSheet open={share} onClose={() => setShare(false)} property={p} onDone={onChanged} />
      <LinkSheet open={link} onClose={() => setLink(false)} propertyId={p.id} onDone={onChanged} />
    </div>
  );
}
const IconAct = ({ icon: I, label, onClick, disabled, id }: any) => (
  <button onClick={onClick} disabled={disabled} data-testid={`property-action-${id}`} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors hover:bg-slate-50 hover:text-navy disabled:opacity-30"><I className="h-4 w-4" />{label}</button>
);

export function ShareSheet({ open, onClose, property, onDone }: { open: boolean; onClose: () => void; property: any; onDone?: () => void }) {
  const [target, setTarget] = useState<'CLIENT' | 'PC'>('CLIENT');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<any>(null);
  const { busy, errors, run } = useAction();
  useEffect(() => { if (open) { setResult(null); setPhone(''); } }, [open]);
  const submit = (channel: 'IN_APP' | 'WHATSAPP') => run(async () => {
    const r = await post('/property-shares', { propertyId: property.id, targetType: target, phone, message, channel });
    setResult(r);
    if (r.share) {
      toast.success(r.message);
      if (channel === 'WHATSAPP') window.open(r.whatsappUrl, '_blank');
      onDone?.(); if (channel === 'IN_APP') onClose();
    }
  }).catch((e) => !(e as ApiError).fieldErrors?.phone && toast.error((e as Error).message));
  return (
    <Sheet open={open} onClose={onClose} title={`Share ${property.code}`} testid="share-sheet"
      footer={result && !result.registered ? <Button variant="success" className="w-full" onClick={() => submit('WHATSAPP')} loading={busy} data-testid="share-whatsapp-btn"><MessageCircle className="h-4 w-4" />Share via WhatsApp</Button>
        : <Button className="w-full" onClick={() => submit('IN_APP')} loading={busy} data-testid="share-submit-btn">Share</Button>}>
      <div className="space-y-4">
        <Chips options={['CLIENT', 'PC'] as const} value={target} onChange={(v) => { setTarget(v); setResult(null); }} label={(v) => (v === 'CLIENT' ? 'Share with Client' : 'Share with Property Consultant')} testid="share-target" />
        <Field label="Phone Number" required error={errors.phone}>
          <Input value={phone} onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setResult(null); }} placeholder="10-digit mobile" inputMode="numeric" data-testid="share-phone-input" invalid={!!errors.phone} />
        </Field>
        <Field label="Message (optional)"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi, sharing a property you may like" data-testid="share-message-input" /></Field>
        {result && !result.registered && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800" data-testid="share-not-registered">Number not registered. You can share via WhatsApp instead.</div>}
        <p className="text-xs text-slate-500">Consultants receive an in-app notification with <b>view-only</b> access.</p>
      </div>
    </Sheet>
  );
}

// Links a property to ONE specific requirement of a client.
export function LinkSheet({ open, onClose, propertyId, clientId, requirementId, onDone }: { open: boolean; onClose: () => void; propertyId?: string; clientId?: string; requirementId?: string; onDone?: () => void }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [client, setClient] = useState<string>(clientId || '');
  const [req, setReq] = useState<string>(requirementId || '');
  const [prop, setProp] = useState<string>(propertyId || '');
  const [interest, setInterest] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [notes, setNotes] = useState('');
  const { busy, run } = useAction();
  const clients = useFetch(open && !clientId ? '/clients' : null, { q: dq, pageSize: 30 });
  const reqs = useFetch(open && client ? '/requirements' : null, { clientId: client, pageSize: 50 });
  const props = useFetch(open && !propertyId ? '/properties' : null, { q: dq, pageSize: 30, scope: 'all' });
  useEffect(() => { if (open) { setClient(clientId || ''); setReq(requirementId || ''); setProp(propertyId || ''); setQ(''); } }, [open, clientId, requirementId, propertyId]);
  const submit = () => run(async () => {
    await post('/property-client-links', { clientId: client, requirementId: req, propertyId: prop, interestLevel: interest, notes });
    toast.success('Property linked to requirement'); onDone?.(); onClose();
  }).catch((e) => toast.error(e.message));
  return (
    <Sheet open={open} onClose={onClose} title="Link Property" testid="link-sheet" footer={<Button className="w-full" disabled={!client || !req || !prop} loading={busy} onClick={submit} data-testid="link-submit-btn">Link to Requirement</Button>}>
      <div className="space-y-4">
        {(!clientId || !propertyId) && <Input placeholder={!propertyId ? 'Search properties' : 'Search clients'} value={q} onChange={(e) => setQ(e.target.value)} data-testid="link-search-input" />}
        {!clientId && <Field label="Client" required><Select value={client} onChange={(e) => { setClient(e.target.value); setReq(''); }} data-testid="link-client-select"><option value="">Select client</option>{clients.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</Select></Field>}
        {!requirementId && <Field label="Requirement" required hint="The property is linked only to this requirement"><Select value={req} onChange={(e) => setReq(e.target.value)} data-testid="link-requirement-select"><option value="">Select requirement</option>{reqs.data?.map((r: any) => <option key={r.id} value={r.id}>{r.code} · {human(r.type)} · {r.location}</option>)}</Select></Field>}
        {!propertyId && <Field label="Property" required><Select value={prop} onChange={(e) => setProp(e.target.value)} data-testid="link-property-select"><option value="">Select property</option>{props.data?.map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.subtype} · {p.location}</option>)}</Select></Field>}
        <Field label="Interest Level"><Chips options={['LOW', 'MEDIUM', 'HIGH'] as const} value={interest} onChange={setInterest} label={human} testid="link-interest" /></Field>
        <Field label="Notes"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="link-notes-input" /></Field>
      </div>
    </Sheet>
  );
}

export function FollowUpSheet({ open, onClose, initial, onDone }: { open: boolean; onClose: () => void; initial?: any; onDone?: () => void }) {
  const editing = !!initial?.id;
  const [f, setF] = useState<any>({});
  const { busy, errors, run } = useAction();
  useEffect(() => {
    if (open) setF({ clientId: initial?.clientId || '', requirementId: initial?.requirementId || '', propertyId: initial?.propertyId || '', dealId: initial?.dealId || '', type: initial?.type || 'CALL', notes: initial?.notes || '', reminderMinutes: initial?.reminderMinutes ?? 30, scheduledAt: toLocalInput(initial?.scheduledAt ? new Date(initial.scheduledAt) : new Date(Date.now() + 3600e3)) });
  }, [open, initial]);
  const clients = useFetch(open ? '/clients' : null, { pageSize: 100, sort: 'name', order: 'asc' });
  const reqs = useFetch(open && f.clientId ? '/requirements' : null, { clientId: f.clientId, pageSize: 50 });
  const props = useFetch(open ? '/properties' : null, { pageSize: 100, scope: 'all' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const submit = () => run(async () => {
    const body = { ...f, scheduledAt: new Date(f.scheduledAt).toISOString(), reminderMinutes: Number(f.reminderMinutes) };
    if (editing) await (await import('../lib/api')).patch(`/follow-ups/${initial.id}`, body); else await post('/follow-ups', body);
    toast.success(editing ? 'Follow-up updated' : 'Follow-up scheduled'); window.dispatchEvent(new Event('notifications:changed')); onDone?.(); onClose();
  }).catch((e) => toast.error(e.message));
  return (
    <Sheet open={open} onClose={onClose} title={editing ? `Edit ${initial.code}` : 'New Follow-up'} testid="followup-sheet" footer={<Button className="w-full" onClick={submit} loading={busy} data-testid="followup-save-btn">{editing ? 'Save' : 'Schedule'}</Button>}>
      <div className="space-y-4">
        <Field label="Client" required error={errors.clientId}><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, requirementId: '' })} data-testid="followup-client-select"><option value="">Select client</option>{clients.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Requirement" error={errors.requirementId}><Select value={f.requirementId} onChange={set('requirementId')} data-testid="followup-requirement-select"><option value="">None</option>{reqs.data?.map((r: any) => <option key={r.id} value={r.id}>{r.code} · {human(r.type)}</option>)}</Select></Field>
        <Field label="Property" error={errors.propertyId}><Select value={f.propertyId} onChange={set('propertyId')} data-testid="followup-property-select"><option value="">None</option>{props.data?.map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.location}</option>)}</Select></Field>
        <Field label="Type" required><Chips options={FU_TYPES} value={f.type} onChange={set('type')} label={human} testid="followup-type" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date & Time" required error={errors.scheduledAt}><Input type="datetime-local" value={f.scheduledAt} onChange={set('scheduledAt')} data-testid="followup-datetime-input" /></Field>
          <Field label="Reminder"><Select value={f.reminderMinutes} onChange={set('reminderMinutes')} data-testid="followup-reminder-select">{[0, 10, 15, 30, 60, 120, 1440].map((m) => <option key={m} value={m}>{m === 0 ? 'At time' : m < 60 ? `${m} min before` : m === 1440 ? '1 day before' : `${m / 60} hr before`}</option>)}</Select></Field>
        </div>
        <Field label="Notes"><Textarea value={f.notes} onChange={set('notes')} data-testid="followup-notes-input" /></Field>
      </div>
    </Sheet>
  );
}

export function ClientSheet({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: any; onSaved: (c: any) => void }) {
  const [f, setF] = useState<any>({});
  const { busy, errors, run } = useAction();
  useEffect(() => { if (open) setF({ name: initial?.name || '', phone: initial?.phone || '', location: initial?.location || '', email: initial?.email || '', isHot: initial?.isHot || false }); }, [open, initial]);
  const submit = () => run(async () => {
    const c = initial?.id ? await (await import('../lib/api')).patch(`/clients/${initial.id}`, f) : await post('/clients', f);
    onSaved(c);
  }).catch((e) => !Object.keys((e as ApiError).fieldErrors || {}).length && toast.error(e.message));
  return (
    <Sheet open={open} onClose={onClose} title={initial?.id ? 'Edit Client' : 'Add Client'} testid="client-sheet" footer={<><Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button><Button className="flex-1" onClick={submit} loading={busy} data-testid="client-save-btn">Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" required error={errors.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rahul Sharma" data-testid="client-name-input" invalid={!!errors.name} /></Field>
        <Field label="Phone Number" required error={errors.phone}><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} inputMode="numeric" placeholder="98765 43210" data-testid="client-phone-input" invalid={!!errors.phone} /></Field>
        <Field label="Location" required error={errors.location}><LocationInput value={f.location} onChange={(v) => setF({ ...f, location: v })} testid="client-location-input" invalid={!!errors.location} /></Field>
        <Field label="Gmail / Email" error={errors.email}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@gmail.com" data-testid="client-email-input" /></Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={f.isHot} onChange={(e) => setF({ ...f, isHot: e.target.checked })} data-testid="client-hot-checkbox" className="h-4 w-4 accent-red-500" />Mark as hot client</label>
      </div>
    </Sheet>
  );
}

export function LocationInput({ value, onChange, testid, invalid }: { value: string; onChange: (v: string) => void; testid: string; invalid?: boolean }) {
  const [opts, setOpts] = useState<any[]>([]);
  useEffect(() => { get('/locations').then(setOpts).catch(() => undefined); }, []);
  const id = `loc-${testid}`;
  return <><Input list={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search or type a location" data-testid={testid} invalid={invalid} /><datalist id={id}>{opts.map((o) => <option key={o.id} value={o.area}>{o.city} {o.pincode}</option>)}</datalist></>;
}

export function Timeline({ items, testid = 'timeline' }: { items?: any[]; testid?: string }) {
  if (!items?.length) return <p className="text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-5" data-testid={testid}>
      {items.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand ring-2 ring-brand-100" />
          <p className="text-sm font-medium">{a.description}</p>
          <p className="mt-0.5 text-xs text-slate-400">{human(a.action)} · {ago(a.createdAt)}{a.requirementCode ? ` · ${a.requirementCode}` : ''}</p>
        </li>
      ))}
    </ol>
  );
}

export const Stat = ({ label, value, testid, accent }: { label: string; value: React.ReactNode; testid?: string; accent?: boolean }) => (
  <div className={`rounded-2xl p-4 ${accent ? 'bg-navy text-white' : 'border border-slate-200/80 bg-white shadow-card'}`} data-testid={testid}>
    <p className={`text-[11px] font-bold uppercase tracking-wider ${accent ? 'text-blue-200' : 'text-slate-500'}`}>{label}</p>
    <p className="mt-1.5 text-2xl font-extrabold tracking-tight">{value}</p>
  </div>
);
export { inr };

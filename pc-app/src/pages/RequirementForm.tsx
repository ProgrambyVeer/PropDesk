import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { ApiError, get, patch, post } from '../lib/api';
import { AGES, AMOUNT_LABEL, CATEGORIES, COMMERCIAL_CATS, FACINGS, FURNISHING, human, inr, REQ_TYPES, SUBTYPES } from '../lib/format';
import { Button, Card, Chips, Field, Input, Select, Skeleton, Textarea } from '../components/ui';
import { LocationInput } from '../components/domain';

const num = (v: any) => (v === '' || v == null ? null : Number(v));
const NUMS = ['bhk', 'bathrooms', 'area', 'dimLength', 'dimWidth', 'amountMin', 'amount', 'deposit', 'leasePeriodMonths', 'floor', 'totalFloors'];

export default function RequirementForm() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState<any>({ clientId: sp.get('clientId') || '', type: '', category: '', location: '', dimUnit: 'FEET', amenities: [] });
  const [client, setClient] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [amenities, setAmenities] = useState<any[]>([]);
  useEffect(() => { get('/amenities').then(setAmenities).catch(() => undefined); }, []);
  useEffect(() => { if (id) get(`/requirements/${id}`).then((r) => { setF({ ...r, availableDate: r.availableDate?.slice(0, 10) ?? '', subCategory: r.subCategory || '' }); setClient(r.client); setLoading(false); }); }, [id]);
  useEffect(() => { if (!id && f.clientId) get(`/clients/${f.clientId}`).then(setClient).catch(() => undefined); }, [id, f.clientId]);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const inp = (k: string, label: string, type = 'number', req = false, ph = '') => (
    <Field label={label} required={req} error={errors[k]}><Input type={type} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} data-testid={`req-${k}-input`} invalid={!!errors[k]} />{type === 'number' && ['amount', 'amountMin', 'deposit'].includes(k) && f[k] ? <span className="mt-1 block text-xs font-semibold text-brand-600">{inr(Number(f[k]))}</span> : null}</Field>
  );
  const sel = (k: string, label: string, opts: string[]) => <Field label={label} error={errors[k]}><Select value={f[k] || ''} onChange={(e) => set(k, e.target.value)} data-testid={`req-${k}-select`}><option value="">Any</option>{opts.map((o) => <option key={o}>{o}</option>)}</Select></Field>;
  const t = f.type as string; const c = f.category as string;
  const looking = t.endsWith('LOOKING'); const rent = t.startsWith('RENT'); const lease = t.startsWith('LEASE');

  const save = async () => {
    if (busy) return;
    const e: Record<string, string> = {};
    if (!t) e.type = 'Choose a requirement type'; if (!c) e.category = 'Choose a category'; if (!f.location) e.location = 'Location is required';
    if (c && c !== 'COMMERCIAL' && !f.subtype) e.subtype = 'Choose a subtype'; if (c === 'COMMERCIAL' && (!f.subtype || !f.subCategory)) e.subtype = 'Choose commercial type and subtype';
    if (c === 'RESIDENTIAL' && (!f.dimLength || !f.dimWidth)) e.dimLength = 'Dimensions are required';
    if (!f.amount) e.amount = `${AMOUNT_LABEL[t] || 'Amount'} is required`;
    setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    const body: any = { ...f }; NUMS.forEach((k) => { body[k] = num(f[k]); }); body.availableDate = f.availableDate || null;
    delete body.code; delete body.id;
    try {
      const r = id ? await patch(`/requirements/${id}`, body) : await post('/requirements', body);
      toast.success(id ? `${r.code} updated` : `Requirement ${r.code} created`); nav(`/clients/${r.clientId}`, { replace: true });
    } catch (err) { setErrors((err as ApiError).fieldErrors || {}); toast.error((err as Error).message); } finally { setBusy(false); }
  };
  if (loading) return <Skeleton className="h-96" />;
  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="requirement-form">
      <div><button onClick={() => nav(-1)} className="flex items-center gap-1 text-sm font-semibold text-slate-500"><ArrowLeft className="h-4 w-4" />Back</button>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{id ? `Edit ${f.code}` : 'Add Requirement'}</h1>
        <p className="text-sm text-slate-500">{client ? `For ${client.name}` : ''}{id ? ' · The Requirement ID never changes' : ' · A unique Requirement ID will be generated'}</p></div>
      <Card className="space-y-5 p-5">
        <Field label="Requirement Type" required error={errors.type}><Chips options={REQ_TYPES} value={t} onChange={(v) => set('type', v)} label={human} testid="req-type" /></Field>
        <Field label="Property Category" required error={errors.category}><Chips options={CATEGORIES} value={c} onChange={(v) => setF({ ...f, category: v, subtype: '', subCategory: '' })} label={human} testid="req-category" /></Field>
        {c === 'COMMERCIAL' && <Field label="Commercial Type" required><Chips options={COMMERCIAL_CATS} value={f.subCategory} onChange={(v) => set('subCategory', v)} testid="req-subcategory" /></Field>}
        {c && <Field label="Subtype" required error={errors.subtype}><Chips options={SUBTYPES[c]} value={f.subtype} onChange={(v) => set('subtype', v)} testid="req-subtype" /></Field>}
        {c && t && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" required error={errors.location}><LocationInput value={f.location} onChange={(v) => set('location', v)} testid="req-location-input" invalid={!!errors.location} /></Field>
          {inp('locality', 'Locality', 'text')}
          {looking && inp('amountMin', `Minimum ${AMOUNT_LABEL[t]} (₹)`)}
          {inp('amount', `${looking ? 'Maximum ' : ''}${AMOUNT_LABEL[t]} (₹)`, 'number', true)}
          {(rent || lease) && inp('deposit', t === 'RENT_LOOKING' ? 'Deposit Preference (₹)' : 'Deposit (₹)')}
          {lease && inp('leasePeriodMonths', 'Lease Period (months)', 'number', true)}
          {(rent || lease) && inp('availableDate', t === 'RENT_LOOKING' ? 'Available Date Preference' : 'Available Date', 'date', t.endsWith('OFFERING'))}
          {c === 'RESIDENTIAL' && <>{inp('bhk', 'BHK')}{inp('bathrooms', 'Bathrooms')}{inp('floor', 'Floor')}{inp('totalFloors', 'Total Floors')}{sel('furnishing', 'Furnishing', FURNISHING)}{sel('propertyAge', 'Property Age', AGES)}{sel('parking', 'Parking', ['None', 'Open', 'Covered', '2+ Covered'])}</>}
          {inp('area', 'Area (sqft)')}
          {sel('facing', 'Facing', FACINGS)}
          {c === 'COMMERCIAL' && <>{sel('transactionType', 'Transaction Type', ['Outright', 'Pre-leased', 'Revenue Share'])}{sel('availability', 'Availability', ['Immediate', 'Within 1 month', 'Within 3 months', 'Under construction'])}</>}
          {c === 'LAND' && sel('khata', 'Khata', ['A Khata', 'B Khata', 'E Khata'])}
          <div className="sm:col-span-2"><Field label="Dimensions (Length × Width)" required={c === 'RESIDENTIAL'} error={errors.dimLength}>
            <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2"><Input type="number" value={f.dimLength ?? ''} onChange={(e) => set('dimLength', e.target.value)} placeholder="40" data-testid="req-dimLength-input" /><span className="font-bold text-slate-400">×</span><Input type="number" value={f.dimWidth ?? ''} onChange={(e) => set('dimWidth', e.target.value)} placeholder="60" data-testid="req-dimWidth-input" />
              <Select value={f.dimUnit} onChange={(e) => set('dimUnit', e.target.value)} className="w-24" data-testid="req-dimUnit-select"><option value="FEET">ft</option><option value="METERS">m</option></Select></div></Field></div>
          {c === 'RESIDENTIAL' && <div className="sm:col-span-2"><Field label="Amenities"><div className="flex flex-wrap gap-2">{amenities.map((a) => { const on = f.amenities?.includes(a.name); return <button key={a.id} type="button" onClick={() => set('amenities', on ? f.amenities.filter((x: string) => x !== a.name) : [...(f.amenities || []), a.name])} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-navy bg-navy text-white' : 'border-slate-200'}`}>{a.name}</button>; })}</div></Field></div>}
          <div className="sm:col-span-2"><Field label="Other Requirements"><Textarea value={f.otherRequirements || ''} onChange={(e) => set('otherRequirements', e.target.value)} data-testid="req-other-input" /></Field></div>
          {id && sel('status', 'Status', ['ACTIVE', 'ON_HOLD', 'FULFILLED', 'CLOSED'])}
        </div>}
      </Card>
      <div className="flex gap-3"><Button variant="secondary" className="flex-1" onClick={() => nav(-1)}>Cancel</Button><Button className="flex-1" onClick={save} loading={busy} data-testid="req-save-btn">{id ? 'Save Changes' : 'Create Requirement'}</Button></div>
    </div>
  );
}

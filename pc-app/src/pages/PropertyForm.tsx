import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Camera, ImagePlus, Trash2, ArrowLeft } from 'lucide-react';
import { ApiError, del, fileUrl, get, patch, post, request, upload } from '../lib/api';
import { AGES, CATEGORIES, COMMERCIAL_CATS, dims, FACINGS, FURNISHING, human, inr, SUBTYPES, txLabel } from '../lib/format';
import { Button, Card, Chips, Field, Input, KV, Select, Textarea, Skeleton } from '../components/ui';
import { LocationInput } from '../components/domain';

const STEPS = ['Category', 'Subtype', 'Details', 'Transactions', 'Dimensions', 'Photos', 'Other Features', 'Review'];
const num = (v: any) => (v === '' || v == null ? null : Number(v));
type Local = { file: File; url: string };

export default function PropertyForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<any>({ category: '', subtype: '', subCategory: '', location: '', dimUnit: 'FEET', amenities: [], transactions: {} as Record<string, any> });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<any[]>([]);
  const [local, setLocal] = useState<Local[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [amenities, setAmenities] = useState<any[]>([]);
  const [loading, setLoading] = useState(!!id);
  const gallery = useRef<HTMLInputElement>(null); const camera = useRef<HTMLInputElement>(null);
  useEffect(() => { get('/amenities').then(setAmenities).catch(() => undefined); }, []);
  useEffect(() => {
    if (!id) return;
    get(`/properties/${id}`).then((p) => {
      const tx: any = {}; p.transactions.forEach((t: any) => { tx[t.kind] = { ...t, availableDate: t.availableDate?.slice(0, 10) ?? '' }; });
      setF({ ...p, subCategory: p.subCategory || '', transactions: tx }); setPhotos(p.photos); setLoading(false);
    });
  }, [id]);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const inp = (k: string, type = 'text', ph = '') => <Input type={type} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={ph} data-testid={`property-${k}-input`} invalid={!!errors[k]} inputMode={type === 'number' ? 'decimal' : undefined} />;
  const setTx = (kind: string, k: string, v: any) => setF((x: any) => ({ ...x, transactions: { ...x.transactions, [kind]: { ...x.transactions[kind], [k]: v } } }));
  const toggleTx = (kind: string) => setF((x: any) => { const t = { ...x.transactions }; if (t[kind]) delete t[kind]; else t[kind] = { kind }; return { ...x, transactions: t }; });
  const R = f.category === 'RESIDENTIAL';
  const area = f.dimLength && f.dimWidth ? Math.round(f.dimLength * f.dimWidth * (f.dimUnit === 'METERS' ? 10.7639 : 1)) : null;

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0 && !f.category) e.category = 'Choose a category';
    if (s === 1) { if (!f.subtype) e.subtype = 'Choose a subtype'; if (f.category === 'COMMERCIAL' && !f.subCategory) e.subCategory = 'Choose Full or Semi Commercial'; }
    if (s === 2 && (!f.location || f.location.length < 2)) e.location = 'Location is required';
    if (s === 3) {
      const kinds = Object.keys(f.transactions);
      if (!kinds.length) e.transactions = 'Select at least one: Sale, Rent or Lease';
      const t = f.transactions;
      if (t.SALE && !t.SALE.salePrice) e['SALE.salePrice'] = 'Sale price is required';
      if (t.RENT) { if (!t.RENT.rentAmount) e['RENT.rentAmount'] = 'Rent amount is required'; if (!t.RENT.availableDate) e['RENT.availableDate'] = 'Available date is required'; }
      if (t.LEASE) { if (!t.LEASE.leaseAmount) e['LEASE.leaseAmount'] = 'Lease amount is required'; if (!t.LEASE.leasePeriodMonths) e['LEASE.leasePeriodMonths'] = 'Lease period is required'; if (!t.LEASE.availableDate) e['LEASE.availableDate'] = 'Available date is required'; }
    }
    if (s === 4 && (!num(f.dimLength) || !num(f.dimWidth))) e.dimLength = 'Length and width are required';
    setErrors(e); return !Object.keys(e).length;
  };
  const next = () => validate(step) && setStep(step + 1);
  const STEP_OF: Record<string, number> = { category: 0, subtype: 1, subCategory: 1, location: 2, floor: 2, transactions: 3, dimLength: 4 };

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const ok = Array.from(files).filter((x) => { if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(x.type)) { toast.error(`${x.name}: unsupported format`); return false; } if (x.size > 8 * 1024 * 1024) { toast.error(`${x.name} exceeds 8 MB`); return false; } return true; });
    if (id) { setProgress(0); try { const c = await upload(`/properties/${id}/photos`, 'photos', ok, setProgress); setPhotos((p) => [...p, ...c]); toast.success('Photos uploaded'); } catch (e) { toast.error((e as Error).message); } setProgress(null); }
    else setLocal((l) => [...l, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const move = async (i: number, d: number) => {
    if (id) { const arr = [...photos]; [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; setPhotos(arr); await request(`/properties/${id}/photos/order`, { method: 'PATCH', body: { ids: arr.map((p) => p.id) } }); }
    else { const arr = [...local]; [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; setLocal(arr); }
  };
  const removePhoto = async (i: number) => { if (id) { await del(`/property-photos/${photos[i].id}`); setPhotos(photos.filter((_, j) => j !== i)); } else setLocal(local.filter((_, j) => j !== i)); };

  const save = async () => {
    if (busy) return;
    for (let s = 0; s < 5; s++) if (!validate(s)) return setStep(s);
    setBusy(true);
    const body = {
      ...f, bhk: num(f.bhk), bathrooms: num(f.bathrooms), balcony: num(f.balcony), floor: num(f.floor), totalFloors: num(f.totalFloors), area: num(f.area), builtUpArea: num(f.builtUpArea), carpetArea: num(f.carpetArea), plotArea: num(f.plotArea), dimLength: num(f.dimLength), dimWidth: num(f.dimWidth),
      transactions: Object.values(f.transactions).map((t: any) => ({ kind: t.kind, salePrice: num(t.salePrice), rentAmount: num(t.rentAmount), leaseAmount: num(t.leaseAmount), depositAmount: num(t.depositAmount), leasePeriodMonths: num(t.leasePeriodMonths), availableDate: t.availableDate || null })),
    };
    try {
      const saved = id ? await patch(`/properties/${id}`, body) : await post('/properties', body);
      if (!id && local.length) { setProgress(0); await upload(`/properties/${saved.id}/photos`, 'photos', local.map((l) => l.file), setProgress); }
      toast.success(id ? 'Property updated' : `Property ${saved.code} saved`); nav(`/properties/${saved.id}`, { replace: true });
    } catch (e) {
      const fe = (e as ApiError).fieldErrors || {}; setErrors(fe);
      const first = Object.keys(fe)[0]; if (first) setStep(STEP_OF[first.split('.')[0]] ?? (first.includes('.') ? 3 : 2));
      toast.error((e as Error).message);
    } finally { setBusy(false); setProgress(null); }
  };
  if (loading) return <Skeleton className="h-96" />;
  const allPhotos = id ? photos.map((p) => fileUrl(p.url)) : local.map((l) => l.url);

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="property-form">
      <div><button onClick={() => (step ? setStep(step - 1) : nav(-1))} className="flex items-center gap-1 text-sm font-semibold text-slate-500" data-testid="wizard-back-btn"><ArrowLeft className="h-4 w-4" />Back</button>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">{id ? `Edit ${f.code}` : 'Add Property'}</h1>
        <div className="mt-4 flex gap-1">{STEPS.map((s, i) => <button key={s} onClick={() => i < step && setStep(i)} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-navy' : 'bg-slate-200'}`} aria-label={s} />)}</div>
        <p className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-500">Step {step + 1} of {STEPS.length} · {STEPS[step]}</p></div>
      <Card className="space-y-5 p-5">
        {step === 0 && <Field label="Property Category" required error={errors.category}><Chips options={CATEGORIES} value={f.category} onChange={(v) => setF({ ...f, category: v, subtype: '', subCategory: '' })} label={human} testid="property-category" /></Field>}
        {step === 1 && <>
          {f.category === 'COMMERCIAL' && <Field label="Commercial Type" required error={errors.subCategory}><Chips options={COMMERCIAL_CATS} value={f.subCategory} onChange={(v) => set('subCategory', v)} testid="property-subcategory" /></Field>}
          <Field label={f.category === 'COMMERCIAL' ? 'Property Subtype' : `${human(f.category)} Type`} required error={errors.subtype}><Chips options={SUBTYPES[f.category] || []} value={f.subtype} onChange={(v) => set('subtype', v)} testid="property-subtype" /></Field>
        </>}
        {step === 2 && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" required error={errors.location} className="sm:col-span-2"><LocationInput value={f.location} onChange={(v) => set('location', v)} testid="property-location-input" invalid={!!errors.location} /></Field>
          <Field label="Locality">{inp('locality', 'text', 'e.g. ITPL Main Road')}</Field>
          <Field label="Facing"><Select value={f.facing || ''} onChange={(e) => set('facing', e.target.value)} data-testid="property-facing-select"><option value="">Select</option>{FACINGS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          {R ? <>
            <Field label="BHK">{inp('bhk', 'number')}</Field><Field label="Bathrooms">{inp('bathrooms', 'number')}</Field><Field label="Balcony">{inp('balcony', 'number')}</Field>
            <Field label="Parking"><Select value={f.parking || ''} onChange={(e) => set('parking', e.target.value)} data-testid="property-parking-select"><option value="">Select</option>{['None', 'Open', 'Covered', '2+ Covered'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <Field label="Floor" error={errors.floor}>{inp('floor', 'number')}</Field><Field label="Total Floors">{inp('totalFloors', 'number')}</Field>
            <Field label="Built-up Area (sqft)">{inp('builtUpArea', 'number')}</Field><Field label="Carpet Area (sqft)">{inp('carpetArea', 'number')}</Field><Field label="Plot Area (sqft)">{inp('plotArea', 'number')}</Field>
            <Field label="Furnishing"><Select value={f.furnishing || ''} onChange={(e) => set('furnishing', e.target.value)} data-testid="property-furnishing-select"><option value="">Select</option>{FURNISHING.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <Field label="Property Age"><Select value={f.propertyAge || ''} onChange={(e) => set('propertyAge', e.target.value)} data-testid="property-age-select"><option value="">Select</option>{AGES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          </> : <>
            <Field label="Area (sqft)" hint="Calculated from dimensions if left blank">{inp('area', 'number')}</Field>
            {f.category === 'LAND' && <Field label="Khata"><Select value={f.khata || ''} onChange={(e) => set('khata', e.target.value)} data-testid="property-khata-select"><option value="">Select</option>{['A Khata', 'B Khata', 'E Khata'].map((x) => <option key={x}>{x}</option>)}</Select></Field>}
          </>}
        </div>}
        {step === 3 && <div className="space-y-4">
          <p className="text-sm text-slate-500">One property can be offered for Sale, Rent and Lease at the same time.</p>
          {errors.transactions && <p className="text-sm font-medium text-red-600">{errors.transactions}</p>}
          {(['SALE', 'RENT', 'LEASE'] as const).map((k) => (
            <div key={k} className={`rounded-2xl border p-4 transition-colors ${f.transactions[k] ? 'border-navy bg-slate-50' : 'border-slate-200'}`}>
              <label className="flex items-center gap-3 font-bold"><input type="checkbox" checked={!!f.transactions[k]} onChange={() => toggleTx(k)} className="h-5 w-5 accent-navy" data-testid={`tx-toggle-${k}`} />{human(k)}</label>
              {f.transactions[k] && <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {k === 'SALE' && <TxIn f={f} k={k} n="salePrice" label="Sale Price (₹)" setTx={setTx} errors={errors} />}
                {k === 'RENT' && <><TxIn f={f} k={k} n="rentAmount" label="Rent Amount (₹/month)" setTx={setTx} errors={errors} /><TxIn f={f} k={k} n="depositAmount" label="Deposit Amount (₹)" setTx={setTx} errors={errors} opt /></>}
                {k === 'LEASE' && <><TxIn f={f} k={k} n="leaseAmount" label="Lease Amount (₹)" setTx={setTx} errors={errors} /><TxIn f={f} k={k} n="depositAmount" label="Deposit Amount (₹)" setTx={setTx} errors={errors} opt /><TxIn f={f} k={k} n="leasePeriodMonths" label="Lease Period (months)" setTx={setTx} errors={errors} /></>}
                {k !== 'SALE' && <TxIn f={f} k={k} n="availableDate" label="Available Date" type="date" setTx={setTx} errors={errors} />}
              </div>}
            </div>
          ))}
        </div>}
        {step === 4 && <div className="space-y-4">
          <Field label="Unit"><Chips options={['FEET', 'METERS']} value={f.dimUnit} onChange={(v) => set('dimUnit', v)} label={human} testid="property-dimunit" /></Field>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <Field label="Length" required error={errors.dimLength}>{inp('dimLength', 'number', '40')}</Field><span className="pb-3 text-xl font-bold text-slate-400">×</span><Field label="Width" required>{inp('dimWidth', 'number', '60')}</Field>
          </div>
          {area && <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-600" data-testid="computed-area">{f.dimLength} × {f.dimWidth} {f.dimUnit === 'METERS' ? 'm' : 'ft'} = {area.toLocaleString('en-IN')} sqft</p>}
        </div>}
        {step === 5 && <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => camera.current?.click()} data-testid="photo-camera-btn"><Camera className="h-4 w-4" />Camera</Button>
            <Button variant="secondary" onClick={() => gallery.current?.click()} data-testid="photo-gallery-btn"><ImagePlus className="h-4 w-4" />Gallery / Files</Button>
          </div>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} data-testid="photo-camera-input" />
          <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} data-testid="photo-file-input" />
          {progress != null && <div className="h-2 overflow-hidden rounded-full bg-slate-100" data-testid="upload-progress"><div className="h-full bg-brand transition-[width]" style={{ width: `${progress}%` }} /></div>}
          <p className="text-xs text-slate-500">JPG, PNG, WEBP or HEIC · up to 8 MB each · first photo is the cover.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{allPhotos.map((u, i) => (
            <div key={u + i} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100" data-testid={`photo-preview-${i}`}>
              <img src={u} alt="" className="h-full w-full object-cover" />{i === 0 && <span className="absolute left-2 top-2 rounded-md bg-navy px-1.5 py-0.5 text-[10px] font-bold text-white">COVER</span>}
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 p-1.5">
                <div className="flex gap-1">{i > 0 && <PBtn onClick={() => move(i, -1)} t={`photo-up-${i}`}><ArrowUp className="h-3.5 w-3.5" /></PBtn>}{i < allPhotos.length - 1 && <PBtn onClick={() => move(i, 1)} t={`photo-down-${i}`}><ArrowDown className="h-3.5 w-3.5" /></PBtn>}</div>
                <PBtn onClick={() => removePhoto(i)} t={`photo-delete-${i}`}><Trash2 className="h-3.5 w-3.5" /></PBtn>
              </div>
            </div>))}</div>
        </div>}
        {step === 6 && <div className="space-y-4">
          <Field label="Title">{inp('title', 'text', 'e.g. Sunlit 3 BHK near ITPL')}</Field>
          {R && <Field label="Amenities"><div className="flex flex-wrap gap-2">{amenities.map((a) => { const on = f.amenities.includes(a.name); return <button key={a.id} type="button" onClick={() => set('amenities', on ? f.amenities.filter((x: string) => x !== a.name) : [...f.amenities, a.name])} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${on ? 'border-navy bg-navy text-white' : 'border-slate-200'}`} data-testid={`amenity-${a.name}`}>{a.name}</button>; })}</div></Field>}
          <Field label="Other Features"><Textarea value={f.otherFeatures || ''} onChange={(e) => set('otherFeatures', e.target.value)} placeholder="Corner plot, near metro, vastu compliant…" data-testid="property-otherFeatures-input" /></Field>
        </div>}
        {step === 7 && <div className="divide-y divide-slate-100" data-testid="property-review">
          <RevRow title="Category" go={() => setStep(0)} v={human(f.category)} /><RevRow title="Subtype" go={() => setStep(1)} v={`${f.subCategory ? `${f.subCategory} · ` : ''}${f.subtype}`} />
          <RevRow title="Details" go={() => setStep(2)} v={[f.location, f.locality, f.bhk && `${f.bhk} BHK`, f.facing && `${f.facing} facing`, f.furnishing].filter(Boolean).join(' · ')} />
          <RevRow title="Transactions" go={() => setStep(3)} v={Object.values(f.transactions).map((t: any) => txLabel({ ...t, salePrice: num(t.salePrice), rentAmount: num(t.rentAmount), leaseAmount: num(t.leaseAmount) }) + (t.depositAmount ? ` · Deposit ${inr(num(t.depositAmount))}` : '')).join(' | ')} />
          <RevRow title="Dimensions" go={() => setStep(4)} v={`${dims(f)}${area ? ` · ${area.toLocaleString('en-IN')} sqft` : ''}`} />
          <RevRow title="Photos" go={() => setStep(5)} v={`${allPhotos.length} photo(s)`} /><RevRow title="Other Features" go={() => setStep(6)} v={[f.title, f.otherFeatures, f.amenities?.join(', ')].filter(Boolean).join(' · ') || '—'} />
        </div>}
      </Card>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => nav(-1)} data-testid="wizard-cancel-btn">Cancel</Button>
        {step < 7 ? <Button className="flex-1" onClick={next} data-testid="wizard-next-btn">Next</Button> : <Button className="flex-1" onClick={save} loading={busy} data-testid="wizard-save-btn">{id ? 'Save Changes' : 'Save Property'}</Button>}
      </div>
    </div>
  );
}
const TxIn = ({ f, k, n, label, type = 'number', setTx, errors, opt }: any) => (
  <Field label={label} required={!opt} error={errors[`${k}.${n}`]}><Input type={type} value={f.transactions[k]?.[n] ?? ''} onChange={(e) => setTx(k, n, e.target.value)} data-testid={`tx-${k}-${n}`} invalid={!!errors[`${k}.${n}`]} />{type === 'number' && n !== 'leasePeriodMonths' && f.transactions[k]?.[n] ? <span className="mt-1 block text-xs font-semibold text-brand-600">{inr(Number(f.transactions[k][n]))}</span> : null}</Field>
);
const PBtn = ({ onClick, children, t }: any) => <button type="button" onClick={onClick} className="rounded-md bg-white/90 p-1 text-navy" data-testid={t}>{children}</button>;
const RevRow = ({ title, v, go }: any) => <div className="flex items-start justify-between gap-3 py-3"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</p><p className="mt-0.5 text-sm font-semibold">{v || '—'}</p></div><button onClick={go} className="text-sm font-semibold text-brand" data-testid={`review-edit-${title.toLowerCase().replace(/\s/g, '-')}`}>Edit</button></div>;
export { KV };

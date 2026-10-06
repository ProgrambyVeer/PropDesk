import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useDebounced, useFetch } from '../lib/hooks';
import { CATEGORIES, human, inr } from '../lib/format';
import { Button, Empty, ErrorState, Input, ListSkeleton, Select, Tabs } from '../components/ui';
import { PropertyCard } from '../components/domain';

const PRICE_STEPS = [0, 25000, 50000, 100000, 500000, 2500000, 5000000, 10000000, 20000000, 50000000, 100000000, 200000000, 500000000];

export default function Properties() {
  const nav = useNavigate();
  const [scope, setScope] = useState<'mine' | 'shared'>('mine');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<any>({ category: '', kind: '', sort: 'createdAt', bhk: '', max: PRICE_STEPS.length - 1 });
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q);
  const { data, meta, loading, error, reload } = useFetch<any[]>('/properties', { scope, q: dq, category: filters.category, kind: filters.kind, sort: filters.sort, bhk: filters.bhk, maxPrice: filters.max < PRICE_STEPS.length - 1 ? PRICE_STEPS[filters.max] : '', pageSize: 50 });
  const set = (k: string) => (e: any) => setFilters({ ...filters, [k]: e.target.value });
  return (
    <div className="space-y-5" data-testid="properties-page">
      <div className="flex items-end justify-between"><div><h1 className="text-3xl font-extrabold tracking-tight">Properties</h1><p className="text-sm text-slate-500">{meta?.total ?? '…'} listings</p></div>
        <Button onClick={() => nav('/properties/new')} data-testid="add-property-btn"><Plus className="h-4 w-4" />Add Property</Button></div>
      <Tabs tabs={[{ id: 'mine', label: 'My Properties' }, { id: 'shared', label: 'Shared with me' }]} value={scope} onChange={setScope} testid="properties-scope" />
      <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by ID, location, type" data-testid="properties-search-input" />
        <Button variant="secondary" onClick={() => setOpen(!open)} data-testid="properties-filter-btn"><SlidersHorizontal className="h-4 w-4" /></Button></div>
      {open && (
        <div className="grid animate-up gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="properties-filters">
          <Select value={filters.category} onChange={set('category')} data-testid="filter-category"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{human(c)}</option>)}</Select>
          <Select value={filters.kind} onChange={set('kind')} data-testid="filter-kind"><option value="">Sale, Rent & Lease</option><option value="SALE">Sale</option><option value="RENT">Rent</option><option value="LEASE">Lease</option></Select>
          <Select value={filters.bhk} onChange={set('bhk')} data-testid="filter-bhk"><option value="">Any BHK</option>{[1, 2, 3, 4, 5].map((b) => <option key={b} value={b}>{b} BHK</option>)}</Select>
          <Select value={filters.sort} onChange={set('sort')} data-testid="filter-sort"><option value="createdAt">Newest</option><option value="updatedAt">Recently updated</option><option value="area">Largest area</option></Select>
          <label className="sm:col-span-2 lg:col-span-4"><span className="text-xs font-semibold text-slate-500">Max price: <b className="text-navy">{filters.max === PRICE_STEPS.length - 1 ? '₹50 Cr+' : inr(PRICE_STEPS[filters.max])}</b></span>
            <input type="range" min={0} max={PRICE_STEPS.length - 1} value={filters.max} onChange={(e) => setFilters({ ...filters, max: Number(e.target.value) })} className="mt-2 w-full accent-navy" data-testid="filter-price-slider" /></label>
        </div>
      )}
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <ListSkeleton /> : !data?.length ? <Empty title={scope === 'shared' ? 'Nothing shared with you yet' : 'No properties found'} action={scope === 'mine' && <Button onClick={() => nav('/properties/new')}>Add your first property</Button>} /> :
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.map((p) => <PropertyCard key={p.id} p={p} onChanged={reload} />)}</div>}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Flame, Plus } from 'lucide-react';
import { useDebounced, useFetch } from '../lib/hooks';
import { Button, Card, Empty, ErrorState, Input, ListSkeleton, Mono, Sheet } from '../components/ui';
import { ClientSheet } from '../components/domain';

export default function Clients() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const [form, setForm] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const { data, meta, loading, error, reload } = useFetch<any[]>('/clients', { q: dq, pageSize: 50 });
  useEffect(() => { if (sp.get('new')) { setForm(true); setSp({}, { replace: true }); } }, [sp, setSp]);
  return (
    <div className="space-y-5" data-testid="clients-page">
      <div className="flex items-end justify-between"><div><h1 className="text-3xl font-extrabold tracking-tight">Clients</h1><p className="text-sm text-slate-500">{meta?.total ?? '…'} clients</p></div>
        <Button onClick={() => setForm(true)} data-testid="add-client-btn"><Plus className="h-4 w-4" />Add Client</Button></div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, location" data-testid="clients-search-input" />
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <ListSkeleton /> : !data?.length ? <Empty title="No clients yet" action={<Button onClick={() => setForm(true)}>Add Client</Button>} /> :
        <Card className="divide-y divide-slate-100">{data.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="flex items-center gap-3 p-4 transition-colors hover:bg-slate-50" data-testid={`client-row-${c.code}`}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-navy">{c.name[0]}</div>
            <div className="min-w-0 flex-1"><p className="flex items-center gap-1.5 truncate font-semibold">{c.name}{c.isHot && <Flame className="h-4 w-4 text-red-500" />}</p><p className="truncate text-xs text-slate-500">+91 {c.phone} · {c.location}</p></div>
            <div className="text-right text-xs text-slate-500"><p><b className="text-navy">{c._count.requirements}</b> req · <b className="text-navy">{c._count.links}</b> linked</p><Mono>{c.code}</Mono></div>
          </Link>))}</Card>}
      <ClientSheet open={form} onClose={() => setForm(false)} onSaved={(c) => { setForm(false); setCreated(c); reload(); }} />
      <Sheet open={!!created} onClose={() => setCreated(null)} title="Client created" testid="client-next-sheet">
        <p className="text-sm text-slate-500"><b className="text-navy">{created?.name}</b> was added.</p>
        <p className="mt-4 text-lg font-bold">What would you like to do next?</p>
        <div className="mt-4 grid gap-2">
          <Button onClick={() => nav(`/clients/${created.id}?link=1`)} variant="secondary" data-testid="next-link-property-btn">Link Property</Button>
          <Button onClick={() => nav(`/requirements/new?clientId=${created.id}`)} data-testid="next-add-requirement-btn">Add Requirement</Button>
          <Button onClick={() => setCreated(null)} variant="ghost" data-testid="next-done-btn">Done</Button>
        </div>
      </Sheet>
    </div>
  );
}

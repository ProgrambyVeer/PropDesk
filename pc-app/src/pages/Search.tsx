import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search as SearchIcon } from 'lucide-react';
import { useDebounced, useFetch } from '../lib/hooks';
import { dt, human, inr } from '../lib/format';
import { Card, Empty, Input, ListSkeleton, Mono } from '../components/ui';

export default function Search() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const { data, loading } = useFetch<any>(dq.length >= 2 ? '/search' : null, { q: dq });
  const groups = data ? [
    { key: 'clients', title: 'Clients', render: (c: any) => <Row to={`/clients/${c.id}`} title={c.name} sub={`${c.phone} · ${c.location}`} code={c.code} /> },
    { key: 'requirements', title: 'Requirements', render: (r: any) => <Row to={`/requirements/${r.id}`} title={`${human(r.type)} · ${r.bhk ? `${r.bhk} BHK ` : ''}${r.subtype ?? ''}`} sub={`${r.client.name} · ${r.location} · ${inr(r.amount)}`} code={r.code} /> },
    { key: 'properties', title: 'Properties', render: (p: any) => <Row to={`/properties/${p.id}`} title={`${p.bhk ? `${p.bhk} BHK ` : ''}${p.subtype} · ${p.location}`} sub={human(p.category)} code={p.code} /> },
    { key: 'deals', title: 'Deals', render: (d: any) => <Row to={`/deals/${d.id}`} title={`${d.client.name} · ${d.property.code}`} sub={`${human(d.stage)} · ${inr(d.dealValue)} · ${d.requirement.code}`} code={d.code} /> },
    { key: 'followUps', title: 'Follow-ups', render: (f: any) => <Row to="/follow-ups" title={`${human(f.type)} · ${f.client.name}`} sub={`${dt(f.scheduledAt)} · ${human(f.status)}`} code={f.code} /> },
  ] : [];
  const total = data ? groups.reduce((s, g) => s + data[g.key].length, 0) : 0;
  return (
    <div className="space-y-6" data-testid="search-page">
      <div className="relative"><SearchIcon className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rahul, 98765…, REQ-000001, PROP-000045, Whitefield, 3 BHK, 1.5 Cr" className="h-12 pl-12" data-testid="global-search-input" /></div>
      {dq.length < 2 ? <Empty title="Search your entire account" text="Clients, requirements, properties, deals and follow-ups." /> : loading ? <ListSkeleton /> : !total ? <Empty title="No results" text={`Nothing matches “${dq}”.`} /> :
        groups.filter((g) => data[g.key].length).map((g) => (
          <section key={g.key} data-testid={`search-group-${g.key}`}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{g.title} · {data[g.key].length}</h2>
            <Card className="divide-y divide-slate-100">{data[g.key].map((x: any) => <div key={x.id}>{g.render(x)}</div>)}</Card>
          </section>
        ))}
    </div>
  );
}
const Row = ({ to, title, sub, code }: { to: string; title: string; sub: string; code: string }) => (
  <Link to={to} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50" data-testid={`search-result-${code}`}><div className="min-w-0"><p className="truncate text-sm font-semibold">{title}</p><p className="truncate text-xs text-slate-500">{sub}</p></div><Mono>{code}</Mono></Link>
);

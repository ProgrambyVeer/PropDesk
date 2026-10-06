import { Link, useSearchParams } from 'react-router-dom';
import { useFetch } from '../lib/hooks';
import { human, inr, STAGES, STAGE_TONE } from '../lib/format';
import { Badge, Card, Empty, ErrorState, ListSkeleton, Mono } from '../components/ui';

export default function Deals() {
  const [sp] = useSearchParams();
  const focus = sp.get('stage');
  const { data, loading, error, reload } = useFetch<any[]>('/deals', { pageSize: 100 });
  if (error) return <ErrorState message={error} retry={reload} />;
  const total = (s: string) => (data || []).filter((d) => d.stage === s);
  return (
    <div className="space-y-5" data-testid="deals-page">
      <div><h1 className="text-3xl font-extrabold tracking-tight">Deals</h1><p className="text-sm text-slate-500">Every deal = Client + Requirement + Property. Create deals from a requirement's matches.</p></div>
      {loading && !data ? <ListSkeleton /> : !data?.length ? <Empty title="No deals yet" text="Open a requirement and create a deal from a matching property." /> :
        <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4">
          {STAGES.map((s) => (
            <div key={s} className={`w-[280px] shrink-0 snap-start rounded-2xl p-3 ${focus === s ? 'bg-brand-50 ring-2 ring-brand/30' : 'bg-slate-100/70'}`} data-testid={`deal-column-${s}`}>
              <div className="mb-3 flex items-center justify-between px-1"><Badge tone={STAGE_TONE[s]}>{human(s)}</Badge><span className="text-xs font-bold text-slate-500">{total(s).length} · {inr(total(s).reduce((a, d) => a + (d.dealValue || 0), 0))}</span></div>
              <div className="space-y-2">{total(s).map((d) => (
                <Link key={d.id} to={`/deals/${d.id}`} data-testid={`deal-card-${d.code}`}>
                  <Card className="mb-2 p-3 transition-shadow hover:shadow-lift">
                    <div className="flex justify-between"><Mono>{d.code}</Mono><span className="text-[11px] font-bold text-slate-400">{d.probability}%</span></div>
                    <p className="mt-1 truncate text-sm font-bold">{d.client.name}</p>
                    <p className="truncate text-xs text-slate-500">{d.property.subtype} · {d.property.location}</p>
                    <p className="mt-1 text-[11px]"><Mono>{d.requirement.code}</Mono> · <Mono>{d.property.code}</Mono></p>
                    <div className="mt-2 flex justify-between text-sm"><b>{inr(d.dealValue)}</b><span className="text-xs font-semibold text-emerald-700">{inr(d.stage === 'CLOSED' ? d.finalCommission : d.expectedCommission)}</span></div>
                  </Card>
                </Link>))}</div>
            </div>))}
        </div>}
    </div>
  );
}

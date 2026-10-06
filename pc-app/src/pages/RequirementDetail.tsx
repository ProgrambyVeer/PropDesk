import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check, Minus, Pencil, X } from 'lucide-react';
import { fileUrl, post } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { AMOUNT_LABEL, dims, human, inr, txLabel, STAGE_TONE } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, KV, ListSkeleton, Mono, Section } from '../components/ui';
import { Timeline } from '../components/domain';

export default function RequirementDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: r, loading, error, reload } = useFetch<any>(`/requirements/${id}`);
  const m = useFetch<any[]>(`/requirements/${id}/matches`);
  const act = useFetch<any[]>('/activity-logs', { requirementId: r?.id, pageSize: 30 });
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <ErrorState message={error} />;
  if (loading || !r) return <ListSkeleton />;
  const link = async (propertyId: string) => {
    setBusy(propertyId);
    try { await post('/property-client-links', { clientId: r.clientId, requirementId: r.id, propertyId, interestLevel: 'MEDIUM' }); toast.success(`Linked to ${r.code}`); m.reload(); reload(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  const deal = async (propertyId: string, price?: number) => {
    setBusy(propertyId);
    try { const d = await post('/deals', { clientId: r.clientId, requirementId: r.id, propertyId, dealValue: price }); toast.success(`Deal ${d.code} created`); nav(`/deals/${d.id}`); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-6" data-testid="requirement-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Mono className="text-sm" >{r.code}</Mono><h1 className="mt-1 text-2xl font-extrabold tracking-tight" data-testid="requirement-title">{human(r.type)} · {r.bhk ? `${r.bhk} BHK ` : ''}{r.subtype}</h1>
          <p className="text-sm text-slate-500">For <Link to={`/clients/${r.clientId}`} className="font-semibold text-brand">{r.client.name}</Link> · {r.location}</p></div>
        <Button variant="secondary" onClick={() => nav(`/requirements/${r.id}/edit`)} data-testid="requirement-edit-btn"><Pencil className="h-4 w-4" />Edit</Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="divide-y divide-slate-100 px-5 py-2 lg:col-span-1">
          <KV k="Category" v={`${human(r.category)}${r.subCategory ? ` · ${r.subCategory}` : ''}`} /><KV k={AMOUNT_LABEL[r.type]} v={`${r.amountMin ? `${inr(r.amountMin)} – ` : ''}${inr(r.amount)}`} />
          {r.deposit != null && <KV k="Deposit" v={inr(r.deposit)} />}{r.leasePeriodMonths && <KV k="Lease Period" v={`${r.leasePeriodMonths} months`} />}
          <KV k="Dimensions" v={dims(r)} /><KV k="Area" v={r.area ? `${r.area} sqft` : '—'} /><KV k="Facing" v={r.facing} /><KV k="Status" v={<Badge tone="green">{human(r.status)}</Badge>} />
        </Card>
        <Section title={`Matches for ${r.code}`} className="lg:col-span-2">
          {m.loading ? <ListSkeleton n={2} /> : !m.data?.length ? <Empty title="No matching properties yet" text="New properties are matched automatically." /> :
            <div className="space-y-3">{m.data.map((x) => {
              const price = x.property.transactions.find((t: any) => t.kind === ({ BUY_LOOKING: 'SALE', SELL_OFFERING: 'SALE', RENT_LOOKING: 'RENT', RENT_OFFERING: 'RENT' } as any)[r.type] || t.kind === 'LEASE');
              return (
                <Card key={x.property.id} className="flex flex-col gap-3 p-4 sm:flex-row" data-testid={`match-${x.property.code}`}>
                  <div className="h-24 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:w-32">{x.property.photos[0] && <img src={fileUrl(x.property.photos[0].url)} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2"><div><Link to={`/properties/${x.property.id}`} className="font-bold hover:text-brand">{x.property.subtype} · {x.property.location}</Link><p className="text-xs"><Mono>{x.property.code}</Mono> · {x.property.transactions.map(txLabel).join(' | ')}</p></div>
                      <span className={`whitespace-nowrap rounded-xl px-2.5 py-1 text-sm font-extrabold ${x.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`} data-testid={`match-score-${x.property.code}`}>{x.score}% MATCH</span></div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{x.reasons.map((rs: any) => <span key={rs.factor} className={`flex items-center gap-0.5 text-xs font-semibold ${rs.matched ? 'text-emerald-700' : rs.partial ? 'text-amber-600' : 'text-slate-400'}`}>{rs.matched ? <Check className="h-3.5 w-3.5" /> : rs.partial ? <Minus className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{rs.factor}</span>)}</div>
                    <div className="mt-3 flex gap-2">{x.linked ? <Badge tone="blue">Linked to {r.code}</Badge> : <Button size="sm" variant="secondary" loading={busy === x.property.id} onClick={() => link(x.property.id)} data-testid={`match-link-${x.property.code}`}>Link to {r.code}</Button>}
                      <Button size="sm" loading={busy === x.property.id} onClick={() => deal(x.property.id, price ? (price.salePrice ?? price.rentAmount ?? price.leaseAmount) : undefined)} data-testid={`match-deal-${x.property.code}`}>Create Deal</Button></div>
                  </div>
                </Card>);
            })}</div>}
        </Section>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Linked Properties">{r.links.length ? <Card className="divide-y divide-slate-100">{r.links.map((l: any) => <Link key={l.id} to={`/properties/${l.property.id}`} className="flex justify-between p-4 text-sm"><span><Mono>{l.property.code}</Mono> · {l.property.subtype}, {l.property.location}</span><Badge tone={STAGE_TONE[l.dealStage]}>{human(l.dealStage)}</Badge></Link>)}</Card> : <p className="text-sm text-slate-500">Nothing linked to {r.code}.</p>}</Section>
        <Section title="Deals">{r.deals.length ? <Card className="divide-y divide-slate-100">{r.deals.map((d: any) => <Link key={d.id} to={`/deals/${d.id}`} className="flex justify-between p-4 text-sm"><span><Mono>{d.code}</Mono> · {d.property.code} · {inr(d.dealValue)}</span><Badge tone={STAGE_TONE[d.stage]}>{human(d.stage)}</Badge></Link>)}</Card> : <p className="text-sm text-slate-500">No deals.</p>}</Section>
      </div>
      <Section title="Requirement Timeline"><Card className="p-5"><Timeline items={act.data ?? []} testid="requirement-timeline" /></Card></Section>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Link2, Pencil, Share2, Trash2, Unlink } from 'lucide-react';
import { del, fileUrl } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { date, dims, human, inr, txLabel, STAGE_TONE } from '../lib/format';
import { Badge, Button, Card, ErrorState, KV, ListSkeleton, Mono, Section, Tabs } from '../components/ui';
import { LinkSheet, SharedBadge, ShareSheet, Stat, Timeline } from '../components/domain';

export default function PropertyDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: p, loading, error, reload } = useFetch<any>(`/properties/${id}`);
  const owner = p?.access === 'OWNER';
  const an = useFetch<any>(owner ? `/properties/${id}/analytics` : null);
  const [tab, setTab] = useState<'overview' | 'clients' | 'analytics' | 'activity'>('overview');
  const [share, setShare] = useState(false); const [link, setLink] = useState(false); const [photo, setPhoto] = useState(0);
  if (error) return <ErrorState message={error} />;
  if (loading || !p) return <ListSkeleton />;
  const remove = async () => { if (!confirm(`Move ${p.code} to Bin?`)) return; await del(`/properties/${p.id}`); toast.success(`${p.code} moved to Bin`); nav('/properties'); };
  const unlink = async (l: any) => { await del(`/property-client-links/${l.id}`); toast.success('Unlinked'); reload(); };
  const a = an.data;
  return (
    <div className="space-y-6" data-testid="property-detail">
      {p.isShared && <SharedBadge />}
      <div className="overflow-hidden rounded-3xl bg-slate-100">
        <div className="aspect-[16/9] max-h-[420px] w-full">{p.photos[photo] ? <img src={fileUrl(p.photos[photo].url)} alt="" className="h-full w-full object-cover" data-testid="property-main-photo" /> : <div className="flex h-full items-center justify-center text-slate-400">No photos</div>}</div>
        {p.photos.length > 1 && <div className="no-scrollbar flex gap-2 overflow-x-auto bg-white p-2">{p.photos.map((ph: any, i: number) => <button key={ph.id} onClick={() => setPhoto(i)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 ${i === photo ? 'ring-navy' : 'ring-transparent'}`}><img src={fileUrl(ph.url)} alt="" className="h-full w-full object-cover" /></button>)}</div>}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><Mono>{p.code}</Mono><h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{p.title || `${p.bhk ? `${p.bhk} BHK ` : ''}${p.subtype} in ${p.location}`}</h1>
          <p className="mt-1 text-sm text-slate-500">{human(p.category)} · {p.subCategory ? `${p.subCategory} · ` : ''}{p.subtype} · {p.location}{p.locality ? `, ${p.locality}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-2">{p.transactions.map((t: any) => <Badge key={t.kind} tone="navy" className="text-xs normal-case">{txLabel(t)}</Badge>)}<Badge tone={p.status === 'ACTIVE' ? 'green' : 'slate'}>{human(p.status)}</Badge></div>
          {!owner && <p className="mt-3 text-sm font-semibold text-emerald-700" data-testid="view-only-note">Shared with you by {p.owner.name} · View only</p>}
        </div>
        {owner && <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => nav(`/properties/${p.id}/edit`)} data-testid="property-edit-btn"><Pencil className="h-4 w-4" />Edit</Button>
          <Button variant="secondary" onClick={() => setShare(true)} data-testid="property-share-btn"><Share2 className="h-4 w-4" />Share</Button>
          <Button variant="secondary" onClick={() => setLink(true)} data-testid="property-link-client-btn"><Link2 className="h-4 w-4" />Link Client</Button>
          <Button variant="ghost" onClick={remove} data-testid="property-delete-btn"><Trash2 className="h-4 w-4 text-red-600" /></Button>
        </div>}
      </div>
      {owner && <Tabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'clients', label: 'Clients & Deals', count: p.links.length }, { id: 'analytics', label: 'Analytics' }, { id: 'activity', label: 'Activity' }]} value={tab} onChange={setTab} testid="property-tab" />}
      {tab === 'overview' && <div className="grid gap-6 lg:grid-cols-2">
        <Card className="divide-y divide-slate-100 px-5 py-2">
          <KV k="Dimensions" v={dims(p)} /><KV k="Area" v={p.area ? `${Math.round(p.area).toLocaleString('en-IN')} sqft` : '—'} /><KV k="Facing" v={p.facing} />
          {p.category === 'RESIDENTIAL' && <><KV k="BHK / Bath / Balcony" v={`${p.bhk ?? '—'} / ${p.bathrooms ?? '—'} / ${p.balcony ?? '—'}`} /><KV k="Built-up / Carpet / Plot" v={`${p.builtUpArea ?? '—'} / ${p.carpetArea ?? '—'} / ${p.plotArea ?? '—'} sqft`} /><KV k="Floor" v={p.floor != null ? `${p.floor} of ${p.totalFloors ?? '—'}` : '—'} /><KV k="Furnishing" v={p.furnishing} /><KV k="Property Age" v={p.propertyAge} /><KV k="Parking" v={p.parking} /></>}
          {p.category === 'LAND' && <KV k="Khata" v={p.khata} />}
          <KV k="Listed" v={date(p.createdAt)} />
        </Card>
        <div className="space-y-4">
          {p.transactions.map((t: any) => <Card key={t.kind} className="p-5"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{human(t.kind)}</p><p className="mt-1 text-2xl font-extrabold">{txLabel(t)}</p>
            {t.kind !== 'SALE' && <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-600"><span>Deposit: <b>{inr(t.depositAmount)}</b></span><span>Available: <b>{date(t.availableDate)}</b></span>{t.kind === 'LEASE' && <span>Period: <b>{t.leasePeriodMonths} months</b></span>}</div>}</Card>)}
          {p.amenities.length > 0 && <Card className="p-5"><p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Amenities</p><div className="flex flex-wrap gap-2">{p.amenities.map((x: string) => <Badge key={x} tone="blue" className="normal-case tracking-normal">{x}</Badge>)}</div></Card>}
          {p.otherFeatures && <Card className="p-5 text-sm">{p.otherFeatures}</Card>}
        </div>
      </div>}
      {tab === 'clients' && <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Linked Clients">{p.links.length ? <Card className="divide-y divide-slate-100">{p.links.map((l: any) => (
          <div key={l.id} className="flex items-center justify-between p-4" data-testid={`property-link-${l.requirement.code}`}><Link to={`/clients/${l.client.id}`}><p className="font-semibold">{l.client.name}</p><p className="text-xs"><Mono>{l.requirement.code}</Mono> · {human(l.requirement.type)} · {human(l.interestLevel)} interest</p></Link>
            <button onClick={() => unlink(l)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" data-testid={`unlink-${l.requirement.code}`} aria-label="Unlink"><Unlink className="h-4 w-4" /></button></div>))}</Card> : <p className="text-sm text-slate-500">No clients linked.</p>}</Section>
        <Section title="Deals">{p.deals.length ? <Card className="divide-y divide-slate-100">{p.deals.map((d: any) => <Link key={d.id} to={`/deals/${d.id}`} className="flex items-center justify-between p-4"><div><p className="font-semibold">{d.client.name}</p><p className="text-xs"><Mono>{d.code}</Mono> · {d.requirement.code} · {inr(d.dealValue)}</p></div><Badge tone={STAGE_TONE[d.stage]}>{human(d.stage)}</Badge></Link>)}</Card> : <p className="text-sm text-slate-500">No deals yet.</p>}</Section>
        <Section title="Shares" className="lg:col-span-2">{p.shares.length ? <Card className="divide-y divide-slate-100">{p.shares.map((s: any) => <div key={s.id} className="flex justify-between p-4 text-sm"><span>{human(s.targetType)} · {s.receiver?.name || `+91 ${s.receiverPhone}`} · {s.channel === 'IN_APP' ? 'In-app' : 'WhatsApp'}</span><span className="text-slate-500">{human(s.permission)} · {human(s.status)} · {date(s.createdAt)}</span></div>)}</Card> : <p className="text-sm text-slate-500">Not shared yet.</p>}</Section>
      </div>}
      {tab === 'analytics' && (a ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="property-analytics">
        <Stat label="Days Listed" value={a.daysListed} /><Stat label="Matched Clients" value={a.matchedClients} /><Stat label="Linked Clients" value={a.linkedClients} /><Stat label="Contacts" value={a.contacts} />
        <Stat label="Site Visits" value={a.siteVisits} /><Stat label="Follow-ups" value={a.followUps} /><Stat label="Shares" value={a.shares} /><Stat label="PCs Shared With" value={a.pcsSharedWith} />
        <Stat label="Deal Stage" value={a.dealStage ? human(a.dealStage) : '—'} /><Stat label="Deal Probability" value={`${a.dealProbability}%`} /><Stat label="Deal Value" value={inr(a.dealValue)} accent /><Stat label="Expected Commission" value={inr(a.expectedCommission)} accent />
        <Stat label="Final Commission" value={inr(a.finalCommission)} accent />
      </div> : <ListSkeleton n={2} />)}
      {tab === 'activity' && <Card className="p-5"><Timeline items={a?.timeline} testid="property-timeline" /></Card>}
      <ShareSheet open={share} onClose={() => setShare(false)} property={p} onDone={reload} />
      <LinkSheet open={link} onClose={() => setLink(false)} propertyId={p.id} onDone={reload} />
    </div>
  );
}

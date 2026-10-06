import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight, Flame, MapPin, Plus, Search, Sparkles } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useFetch } from '../lib/hooks';
import { fileUrl } from '../lib/api';
import { human, inr, time, dt, STAGE_TONE } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, ListSkeleton, Mono, Section } from '../components/ui';
import { PropertyCard, Stat, Timeline } from '../components/domain';

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data, loading, error, reload } = useFetch<any>('/dashboard');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  if (error) return <ErrorState message={error} retry={reload} />;
  return (
    <div className="space-y-8" data-testid="dashboard">
      <div className="animate-up">
        <p className="text-sm font-medium text-slate-500">{greet}{user && user.name ? `, ${user.name.split(' ')[0]}` : ''}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Today at a glance</h1>
        <button onClick={() => nav('/search')} className="mt-5 flex h-12 w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-left text-sm text-slate-400 shadow-card transition-shadow hover:shadow-lift" data-testid="dashboard-search-btn">
          <Search className="h-5 w-5" />Search clients, REQ-…, PROP-…, locations, 3 BHK…
        </button>
      </div>
      {loading || !data ? <ListSkeleton n={4} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Properties" value={data.stats.properties} testid="stat-properties" />
            <Stat label="Clients" value={data.stats.clients} testid="stat-clients" />
            <Stat label="Follow-ups Today" value={data.stats.followUpsToday} testid="stat-followups-today" />
            <Stat label="Potential Deal Value" value={inr(data.stats.potentialDealValue)} testid="stat-deal-value" accent />
            <Stat label="Potential Commission" value={inr(data.stats.potentialCommission)} testid="stat-commission" accent />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => nav('/properties/new')} data-testid="quick-add-property-btn"><Plus className="h-4 w-4" />Property</Button>
            <Button variant="secondary" onClick={() => nav('/clients?new=1')} data-testid="quick-add-client-btn"><Plus className="h-4 w-4" />Client</Button>
            <Button variant="secondary" onClick={() => nav('/follow-ups?new=1')} data-testid="quick-add-followup-btn"><Plus className="h-4 w-4" />Follow-up</Button>
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <Section title="Today's Follow-ups" action={<Link to="/follow-ups" className="text-sm font-semibold text-brand">View all</Link>}>
              {data.todaysFollowUps.length ? <Card className="divide-y divide-slate-100">{data.todaysFollowUps.map((f: any) => (
                <Link key={f.id} to="/follow-ups" className="flex items-center gap-3 p-4 hover:bg-slate-50" data-testid={`today-followup-${f.code}`}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand"><CalendarClock className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{human(f.type)} · {f.client.name}</p><p className="text-xs text-slate-500">{time(f.scheduledAt)}{f.requirement ? ` · ${f.requirement.code}` : ''}</p></div>
                  <Badge tone={f.status === 'COMPLETED' ? 'green' : f.status === 'MISSED' ? 'red' : 'blue'}>{human(f.status)}</Badge>
                </Link>))}</Card> : <Empty title="No follow-ups today" text="Enjoy the calm — or schedule one." />}
            </Section>
            <Section title="Upcoming Site Visits">
              {data.upcomingSiteVisits.length ? <Card className="divide-y divide-slate-100">{data.upcomingSiteVisits.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between p-4"><div><p className="text-sm font-semibold">{f.client.name}</p><p className="text-xs text-slate-500"><MapPin className="mr-1 inline h-3 w-3" />{f.property?.location ?? '—'} {f.property && <Mono>{f.property.code}</Mono>}</p></div><span className="text-xs font-semibold text-slate-600">{dt(f.scheduledAt)}</span></div>))}</Card> : <Empty title="No site visits planned" />}
            </Section>
            <Section title="Hot Clients">
              {data.hotClients.length ? <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">{data.hotClients.map((c: any) => (
                <Link key={c.id} to={`/clients/${c.id}`} className="min-w-[160px] rounded-2xl border border-slate-200 bg-white p-4 shadow-card" data-testid={`hot-client-${c.code}`}>
                  <Flame className="h-5 w-5 text-red-500" /><p className="mt-2 truncate font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.location} · {c._count.requirements} req</p>
                </Link>))}</div> : <Empty title="No hot clients yet" />}
            </Section>
            <Section title="Property Matches">
              {data.propertyMatches.length ? <Card className="divide-y divide-slate-100">{data.propertyMatches.map((m: any) => (
                <Link key={m.requirement.id + m.property.id} to={`/requirements/${m.requirement.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50" data-testid="dashboard-match-row">
                  <div className="h-12 w-12 overflow-hidden rounded-xl bg-slate-100">{m.property.photo && <img src={fileUrl(m.property.photo)} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{m.requirement.client.name} ↔ {m.property.subtype}, {m.property.location}</p><p className="text-xs"><Mono>{m.requirement.code}</Mono> · <Mono>{m.property.code}</Mono></p></div>
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-extrabold text-emerald-700"><Sparkles className="mr-0.5 inline h-3 w-3" />{m.score}%</span>
                </Link>))}</Card> : <Empty title="No new matches" />}
            </Section>
          </div>
          <Section title="Deal Pipeline" action={<Link to="/deals" className="text-sm font-semibold text-brand">Open pipeline</Link>}>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">{data.pipeline.map((s: any) => (
              <Link to={`/deals?stage=${s.stage}`} key={s.stage} className="min-w-[150px] rounded-2xl border border-slate-200 bg-white p-4 shadow-card" data-testid={`pipeline-${s.stage}`}>
                <Badge tone={STAGE_TONE[s.stage]}>{human(s.stage)}</Badge><p className="mt-3 text-2xl font-extrabold">{s.count}</p><p className="text-xs text-slate-500">{inr(s.value)}</p>
              </Link>))}</div>
          </Section>
          <Section title="Recent Properties" action={<Link to="/properties" className="flex items-center text-sm font-semibold text-brand">All<ChevronRight className="h-4 w-4" /></Link>}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.recentProperties.map((p: any) => <PropertyCard key={p.id} p={p} onChanged={reload} />)}</div>
          </Section>
          <Section title="Recent Activity" action={<Link to="/activity" className="text-sm font-semibold text-brand">View log</Link>}>
            <Card className="p-5"><Timeline items={data.recentActivity} /></Card>
          </Section>
        </>
      )}
    </div>
  );
}

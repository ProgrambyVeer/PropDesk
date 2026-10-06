import { Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useFetch } from '../lib/hooks';
import { human, inr } from '../lib/format';
import { Card, ErrorState, ListSkeleton, Section } from '../components/ui';
import { Stat } from '../components/domain';

const COLORS = ['#0F172A', '#2563EB', '#60A5FA', '#10B981', '#F59E0B', '#94A3B8', '#6366F1', '#EF4444', '#0EA5E9'];
const ChartCard = ({ title, children }: { title: string; children: React.ReactElement }) => <Card className="p-4"><p className="mb-3 text-sm font-bold">{title}</p><div className="h-56"><ResponsiveContainer>{children}</ResponsiveContainer></div></Card>;
const PieC = ({ data }: { data: any[] }) => <PieChart><Pie data={data.map((d) => ({ ...d, name: human(d.name) }))} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>;

export default function Analytics() {
  const { data: a, loading, error } = useFetch<any>('/analytics');
  if (error) return <ErrorState message={error} />;
  if (loading || !a) return <ListSkeleton n={6} />;
  const t = a.totals;
  return (
    <div className="space-y-8" data-testid="analytics-page">
      <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[['Total Properties', t.totalProperties], ['Active Properties', t.activeProperties], ['Sold', t.sold], ['Rented', t.rented], ['Leased', t.leased], ['Total Clients', t.totalClients], ['New Clients (30d)', t.newClients], ['Active Requirements', t.activeRequirements], ['Matches', t.matches], ['Site Visits', t.siteVisits], ['Deals', t.deals], ['Closed Deals', t.closedDeals]].map(([l, v]) => <Stat key={l} label={l} value={v} testid={`analytics-${String(l).toLowerCase().replace(/[^a-z]+/g, '-')}`} />)}
        <Stat label="Deal Value" value={inr(t.dealValue)} accent /><Stat label="Expected Commission" value={inr(t.expectedCommission)} accent /><Stat label="Earned Commission" value={inr(t.earnedCommission)} accent testid="analytics-earned" />
      </div>
      <Section title="Performance"><div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly Deals"><BarChart data={a.monthlyDeals}><CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" /><XAxis dataKey="month" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="created" fill="#94A3B8" radius={[6, 6, 0, 0]} /><Bar dataKey="closed" fill="#0F172A" radius={[6, 6, 0, 0]} /></BarChart></ChartCard>
        <ChartCard title="Monthly Commission"><LineChart data={a.monthlyCommission}><CartesianGrid strokeDasharray="3 3" stroke="#EEF2F7" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => inr(v)} width={70} /><Tooltip formatter={(v: any) => inr(v)} /><Line dataKey="earned" stroke="#10B981" strokeWidth={2.5} /><Line dataKey="expected" stroke="#2563EB" strokeWidth={2} strokeDasharray="4 4" /></LineChart></ChartCard>
        <ChartCard title="Deal Funnel"><FunnelChart><Tooltip /><Funnel dataKey="count" data={a.dealFunnel.filter((x: any) => x.count).map((x: any, i: number) => ({ ...x, name: human(x.stage), fill: COLORS[i % COLORS.length] }))} isAnimationActive><LabelList position="right" fill="#0F172A" stroke="none" dataKey="name" fontSize={11} /></Funnel></FunnelChart></ChartCard>
        <ChartCard title="Follow-up Completion"><PieC data={a.followUpCompletion} /></ChartCard>
        <ChartCard title="Property Distribution"><PieC data={a.propertyDistribution} /></ChartCard>
        <ChartCard title="Client Distribution (by requirement type)"><PieC data={a.clientDistribution} /></ChartCard>
        <ChartCard title="Locations"><BarChart data={a.locations} layout="vertical"><XAxis type="number" allowDecimals={false} fontSize={11} /><YAxis type="category" dataKey="name" width={110} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="#2563EB" radius={[0, 6, 6, 0]} /></BarChart></ChartCard>
        <ChartCard title="Property Types"><BarChart data={a.propertyTypes}><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="#0F172A" radius={[6, 6, 0, 0]} /></BarChart></ChartCard>
      </div></Section>
    </div>
  );
}

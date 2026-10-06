import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Plus } from 'lucide-react';
import { del, get, patch, post, put } from './lib/api';
import { useDebounced, useFetch } from './lib/hooks';
import { date, dt, human, inr, CATEGORIES, REQ_TYPES, STAGES, txPrice } from './lib/format';
import { Btn, Code, Confirm, downloadCsv, In, Metric, Modal, Panel, Pill, Sel, Table } from './ui';
import { useAdmin } from './main';

const H = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <div className="mb-6 flex items-end justify-between"><div><h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div><div className="flex gap-2">{children}</div></div>
);
const ExportBtn = ({ e }: { e: string }) => { const { can } = useAdmin(); return can('export') ? <Btn variant="secondary" onClick={() => downloadCsv(e).catch((x) => toast.error(x.message))} data-testid={`export-${e}-btn`}><Download className="h-4 w-4" />Export CSV</Btn> : null; };
const PcCell = ({ o }: { o: any }) => (o ? <Link to={`/pcs/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-blue-700 hover:underline">{o.name || o.phone}</Link> : <>—</>);
type Filter = { k: string; label: string; opts: string[] };

function ListPage({ path, cols, filters = [], detail, pcId, exportKey, title, sub, extra }: { path: string; cols: { h: string; r: (x: any) => ReactNode }[]; filters?: Filter[]; detail?: (x: any) => string; pcId?: string; exportKey?: string; title?: string; sub?: string; extra?: Record<string, string> }) {
  const nav = useNavigate();
  const [q, setQ] = useState(''); const dq = useDebounced(q); const [f, setF] = useState<Record<string, string>>({}); const [page, setPage] = useState(1);
  const { data, meta, loading, error } = useFetch<any[]>(path, { q: dq, page, pageSize: 25, pcId, ...f, ...extra });
  return (
    <div>
      {title && <H title={title} sub={sub ?? (meta ? `${meta.total} records` : '')}>{exportKey && <ExportBtn e={exportKey} />}</H>}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <In placeholder="Search…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-72" data-testid="list-search-input" />
          {filters.map((fl) => <Sel key={fl.k} value={f[fl.k] || ''} onChange={(e) => { setF({ ...f, [fl.k]: e.target.value }); setPage(1); }} data-testid={`filter-${fl.k}`}><option value="">{fl.label}: All</option>{fl.opts.map((o) => <option key={o} value={o}>{human(o)}</option>)}</Sel>)}
        </div>
        {error ? <p className="p-5 text-sm text-red-600">{error}</p> : loading && !data ? <p className="p-8 text-center text-sm text-slate-400">Loading…</p> : <Table cols={cols} rows={data || []} onRow={detail ? (x) => nav(detail(x)) : undefined} />}
        {meta && meta.totalPages > 1 && <div className="flex items-center justify-end gap-2 border-t p-3 text-sm"><Btn variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Btn><span>Page {page} / {meta.totalPages}</span><Btn variant="secondary" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Next</Btn></div>}
      </div>
    </div>
  );
}

const C = {
  clients: [{ h: 'Client ID', r: (x: any) => <Code>{x.code}</Code> }, { h: 'Name', r: (x: any) => <b>{x.name}</b> }, { h: 'Phone', r: (x: any) => x.phone }, { h: 'Location', r: (x: any) => x.location }, { h: 'Managed by PC', r: (x: any) => <PcCell o={x.owner} /> }, { h: 'Req.', r: (x: any) => x._count.requirements }, { h: 'Linked', r: (x: any) => x._count.links }, { h: 'Deals', r: (x: any) => x._count.deals }, { h: 'Created', r: (x: any) => date(x.createdAt) }, { h: 'Status', r: (x: any) => <Pill v={x.deletedAt ? 'IN_BIN' : x.status} /> }],
  properties: [{ h: 'Property ID', r: (x: any) => <Code>{x.code}</Code> }, { h: 'Type', r: (x: any) => human(x.category) }, { h: 'Subtype', r: (x: any) => x.subtype }, { h: 'Location', r: (x: any) => x.location }, { h: 'Transaction / Price', r: (x: any) => x.prices.map((p: any) => `${human(p.kind)} ${inr(p.price)}`).join(' · ') }, { h: 'Managed by PC', r: (x: any) => <PcCell o={x.owner} /> }, { h: 'Linked', r: (x: any) => x._count.links }, { h: 'Status', r: (x: any) => <Pill v={x.status} /> }, { h: 'Created', r: (x: any) => date(x.createdAt) }],
  requirements: [{ h: 'Requirement ID', r: (x: any) => <Code>{x.code}</Code> }, { h: 'Client', r: (x: any) => x.client.name }, { h: 'PC', r: (x: any) => <PcCell o={x.owner} /> }, { h: 'Type', r: (x: any) => human(x.type) }, { h: 'Property Type', r: (x: any) => `${human(x.category)} · ${x.subtype ?? ''}` }, { h: 'Location', r: (x: any) => x.location }, { h: 'Budget', r: (x: any) => inr(x.amount) }, { h: 'Status', r: (x: any) => <Pill v={x.status} /> }, { h: 'Created', r: (x: any) => date(x.createdAt) }],
  deals: [{ h: 'Deal ID', r: (x: any) => <Code>{x.code}</Code> }, { h: 'Client', r: (x: any) => x.client.name }, { h: 'Requirement', r: (x: any) => <Code>{x.requirement.code}</Code> }, { h: 'Property', r: (x: any) => <Code>{x.property.code}</Code> }, { h: 'PC', r: (x: any) => <PcCell o={x.owner} /> }, { h: 'Stage', r: (x: any) => <Pill v={x.stage} /> }, { h: 'Value', r: (x: any) => inr(x.dealValue) }, { h: 'Expected', r: (x: any) => inr(x.expectedCommission) }, { h: 'Final', r: (x: any) => inr(x.finalCommission) }, { h: 'Created', r: (x: any) => date(x.createdAt) }, { h: 'Closed', r: (x: any) => date(x.closingDate) }],
  followUps: [{ h: 'ID', r: (x: any) => <Code>{x.code}</Code> }, { h: 'PC', r: (x: any) => <PcCell o={x.owner} /> }, { h: 'Client', r: (x: any) => x.client.name }, { h: 'Requirement', r: (x: any) => x.requirement ? <Code>{x.requirement.code}</Code> : '—' }, { h: 'Property', r: (x: any) => x.property ? <Code>{x.property.code}</Code> : '—' }, { h: 'Date', r: (x: any) => date(x.scheduledAt) }, { h: 'Time', r: (x: any) => new Date(x.scheduledAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) }, { h: 'Type', r: (x: any) => human(x.type) }, { h: 'Status', r: (x: any) => <Pill v={x.status} /> }],
};
const FU_FILTERS: Filter[] = [{ k: 'status', label: 'Status', opts: ['SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED'] }, { k: 'type', label: 'Type', opts: ['CALL', 'WHATSAPP', 'SITE_VISIT', 'MEETING', 'OTHER'] }];
const D = (e: string) => (x: any) => `/${e}/${x.id}`;

export const Clients = () => <ListPage title="Clients" path="/clients" cols={C.clients} detail={D('clients')} exportKey="clients" />;
export const Properties = () => <ListPage title="Properties" path="/properties" cols={C.properties} detail={D('properties')} exportKey="properties" filters={[{ k: 'category', label: 'Type', opts: CATEGORIES }, { k: 'kind', label: 'Transaction', opts: ['SALE', 'RENT', 'LEASE'] }, { k: 'status', label: 'Status', opts: ['ACTIVE', 'INACTIVE', 'SOLD', 'RENTED', 'LEASED'] }]} />;
export const Requirements = () => <ListPage title="Requirements" sub="Requirement IDs are immutable and never reused" path="/requirements" cols={C.requirements} detail={D('requirements')} exportKey="requirements" filters={[{ k: 'type', label: 'Type', opts: REQ_TYPES }, { k: 'category', label: 'Property', opts: CATEGORIES }]} />;
export const Deals = () => <ListPage title="Deals" path="/deals" cols={C.deals} detail={D('deals')} exportKey="deals" filters={[{ k: 'stage', label: 'Stage', opts: STAGES }, { k: 'category', label: 'Property', opts: CATEGORIES }]} />;
export const FollowUps = () => <ListPage title="Follow-ups" path="/follow-ups" cols={C.followUps} exportKey="follow-ups" filters={FU_FILTERS} />;
export const Notifications = () => <ListPage title="Notification Center" path="/notifications" filters={[{ k: 'type', label: 'Type', opts: ['PROPERTY_MATCH', 'PROPERTY_SHARE', 'FOLLOW_UP', 'DEAL', 'SYSTEM'] }, { k: 'status', label: 'Status', opts: ['PENDING', 'DELIVERED', 'READ', 'CANCELLED'] }]}
  cols={[{ h: 'ID', r: (x) => <Code>{x.code}</Code> }, { h: 'Type', r: (x) => human(x.type) }, { h: 'Recipient PC', r: (x) => <PcCell o={x.recipient} /> }, { h: 'Title', r: (x) => x.title }, { h: 'Status', r: (x) => <Pill v={x.status} /> }, { h: 'Created', r: (x) => dt(x.createdAt) }, { h: 'Delivered', r: (x) => dt(x.deliveredAt) }, { h: 'Read', r: (x) => dt(x.readAt) }]} />;

export function Dashboard() {
  const { data: d } = useFetch<any>('/dashboard');
  if (!d) return <p className="text-slate-400">Loading…</p>;
  const t = d.totals; const m = d.thisMonth;
  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <H title="Platform Dashboard" sub="Live metrics across all property consultants" />
      <div className="grid grid-cols-5 gap-4">{[['Total PCs', t.totalPcs], ['Active PCs', t.activePcs], ['Suspended PCs', t.suspendedPcs], ['Total Clients', t.totalClients], ['Total Properties', t.totalProperties], ['Active Properties', t.activeProperties], ['Total Requirements', t.totalRequirements], ['Active Requirements', t.activeRequirements], ['Active Deals', t.activeDeals], ['Closed Deals', t.closedDeals]].map(([l, v]) => <Metric key={l} label={l} value={v} testid={`metric-${String(l).toLowerCase().replace(/\s+/g, '-')}`} />)}</div>
      <div className="grid grid-cols-3 gap-4"><Metric label="Total Deal Value" value={inr(t.totalDealValue)} /><Metric label="Total Expected Commission" value={inr(t.totalExpectedCommission)} /><Metric label="Total Earned Commission" value={inr(t.totalEarnedCommission)} testid="metric-earned" /></div>
      <Panel title="This Month"><div className="grid grid-cols-6 gap-4">{[['New PCs', m.newPcs], ['New Clients', m.newClients], ['New Properties', m.newProperties], ['New Requirements', m.newRequirements], ['Deals Closed', m.dealsClosed], ['Commission', inr(m.commission)]].map(([l, v]) => <div key={l}><p className="text-xs font-bold uppercase text-slate-500">{l}</p><p className="text-xl font-extrabold">{v}</p></div>)}</div></Panel>
      <Panel title="Recent Admin Activity"><Table cols={[{ h: 'When', r: (x) => dt(x.createdAt) }, { h: 'Admin', r: (x) => x.admin?.name }, { h: 'Action', r: (x) => human(x.action) }, { h: 'Entity', r: (x) => x.entityCode || x.entityType }]} rows={d.recentAudit} /></Panel>
    </div>
  );
}

export function Pcs() {
  const { can } = useAdmin(); const [open, setOpen] = useState(false); const [f, setF] = useState<any>({}); const [k, setK] = useState(0);
  const create = async () => { try { await post('/pcs', f); toast.success('PC created'); setOpen(false); setK(k + 1); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div key={k}>
      <H title="Property Consultants">{can('pcs:write') && <Btn onClick={() => { setF({}); setOpen(true); }} data-testid="create-pc-btn"><Plus className="h-4 w-4" />Add PC</Btn>}<ExportBtn e="pcs" /></H>
      <ListPage path="/pcs" detail={(x) => `/pcs/${x.id}`} filters={[{ k: 'status', label: 'Status', opts: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] }]}
        cols={[{ h: 'PC ID', r: (x) => <Code>{x.pcCode}</Code> }, { h: 'Name', r: (x) => <b>{x.name || '—'}</b> }, { h: 'Phone', r: (x) => x.phone }, { h: 'Email', r: (x) => x.email ?? '—' }, { h: 'Company', r: (x) => x.profile?.companyName ?? '—' }, { h: 'RERA', r: (x) => <span className="text-xs">{x.profile?.reraNumber ?? '—'}</span> }, { h: 'Status', r: (x) => <Pill v={x.status} /> }, { h: 'Props', r: (x) => x._count.properties }, { h: 'Clients', r: (x) => x._count.clients }, { h: 'Req.', r: (x) => x._count.requirements }, { h: 'Deals', r: (x) => x._count.deals }, { h: 'Created', r: (x) => date(x.createdAt) }, { h: 'Last Login', r: (x) => dt(x.lastLoginAt) }]} />
      <Modal open={open} title="Add Property Consultant" onClose={() => setOpen(false)} footer={<Btn onClick={create} data-testid="create-pc-submit">Create</Btn>}>
        {['name', 'phone', 'email', 'companyName', 'reraNumber'].map((x) => <In key={x} className="w-full" placeholder={human(x)} value={f[x] || ''} onChange={(e) => setF({ ...f, [x]: e.target.value })} data-testid={`pc-${x}-input`} />)}
      </Modal>
    </div>
  );
}

export function PcDetail() {
  const { id } = useParams(); const { can } = useAdmin();
  const { data: p, reload } = useFetch<any>(`/pcs/${id}`);
  const [tab, setTab] = useState('overview'); const [status, setStatus] = useState<string | null>(null);
  const an = useFetch<any>(tab === 'analytics' ? `/pcs/${id}/analytics` : null);
  const act = useFetch<any[]>(tab === 'activity' ? `/pcs/${id}/activity` : null, { pageSize: 100 });
  if (!p) return <p className="text-slate-400">Loading…</p>;
  const s = p.stats;
  const setSt = async (reason: string) => { await post(`/pcs/${p.id}/status`, { status, reason, confirm: true }); toast.success(`PC ${human(status!)}`); reload(); };
  return (
    <div className="space-y-6" data-testid="pc-detail">
      <H title={p.name || p.phone} sub={`${p.pcCode} · +91 ${p.phone} · ${p.email ?? 'no email'}`}>
        <Pill v={p.status} />
        {can('pcs:status') && p.status !== 'ACTIVE' && <Btn onClick={() => setStatus('ACTIVE')} data-testid="pc-activate-btn">Activate</Btn>}
        {can('pcs:status') && p.status === 'ACTIVE' && <><Btn variant="danger" onClick={() => setStatus('SUSPENDED')} data-testid="pc-suspend-btn">Suspend</Btn><Btn variant="secondary" onClick={() => setStatus('DEACTIVATED')} data-testid="pc-deactivate-btn">Deactivate</Btn></>}
      </H>
      <div className="flex gap-1 border-b border-slate-200">{['overview', 'properties', 'clients', 'requirements', 'deals', 'follow-ups', 'activity', 'analytics'].map((t) => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-semibold capitalize ${tab === t ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500'}`} data-testid={`pc-tab-${t}`}>{t}</button>)}</div>
      {tab === 'overview' && <><div className="grid grid-cols-4 gap-4">{[['Properties', s.properties], ['Clients', s.clients], ['Requirements', s.requirements], ['Active Deals', s.activeDeals], ['Closed Deals', s.closedDeals], ['Deal Value', inr(s.dealValue)], ['Commission Earned', inr(s.commission)], ['Follow-ups', s.followUps]].map(([l, v]) => <Metric key={l} label={l} value={v} />)}</div>
        <div className="grid grid-cols-2 gap-4"><Panel title="Profile & Company"><dl className="grid grid-cols-2 gap-3 text-sm">{[['Company', p.profile?.companyName], ['RERA', p.profile?.reraNumber], ['Office', p.profile?.officeAddress], ['WhatsApp', p.profile?.whatsappNumber], ['Areas of Operation', p.profile?.areasOfOperation?.join(', ')], ['Created', date(p.createdAt)], ['Last Login', dt(p.lastLoginAt)]].map(([k, v]) => <div key={k}><dt className="text-xs font-bold uppercase text-slate-400">{k}</dt><dd className="font-semibold">{v || '—'}</dd></div>)}</dl></Panel>
          <Panel title="Status History"><Table cols={[{ h: 'When', r: (x) => dt(x.createdAt) }, { h: 'By', r: (x) => x.admin?.name }, { h: 'Change', r: (x) => `${x.fromStatus} → ${x.toStatus}` }, { h: 'Reason', r: (x) => x.reason }]} rows={p.statusChanges} /></Panel></div></>}
      {tab === 'properties' && <ListPage path="/properties" pcId={p.id} cols={C.properties} detail={D('properties')} />}
      {tab === 'clients' && <ListPage path="/clients" pcId={p.id} cols={C.clients} detail={D('clients')} />}
      {tab === 'requirements' && <ListPage path="/requirements" pcId={p.id} cols={C.requirements} detail={D('requirements')} />}
      {tab === 'deals' && <ListPage path="/deals" pcId={p.id} cols={C.deals} detail={D('deals')} />}
      {tab === 'follow-ups' && <ListPage path="/follow-ups" pcId={p.id} cols={C.followUps} filters={FU_FILTERS} />}
      {tab === 'activity' && <Panel><Table cols={[{ h: 'When', r: (x) => dt(x.createdAt) }, { h: 'Action', r: (x) => human(x.action) }, { h: 'Description', r: (x) => x.description }, { h: 'Requirement', r: (x) => x.requirementCode ? <Code>{x.requirementCode}</Code> : '' }]} rows={act.data || []} /></Panel>}
      {tab === 'analytics' && an.data && <AnalyticsView a={an.data} />}
      <Confirm open={!!status} title={`${human(status || '')} PC`} text={status === 'ACTIVE' ? 'Access to the PC application will be restored.' : 'The PC will be signed out and blocked from the PC application. Their data is kept.'} withReason={status !== 'ACTIVE'} danger={status !== 'ACTIVE'} onClose={() => setStatus(null)} onConfirm={setSt} />
    </div>
  );
}

const KV = ({ o, keys }: { o: any; keys: [string, (x: any) => ReactNode][] }) => <dl className="grid grid-cols-3 gap-4 text-sm">{keys.map(([k, f]) => <div key={k}><dt className="text-xs font-bold uppercase text-slate-400">{k}</dt><dd className="font-semibold">{f(o) ?? '—'}</dd></div>)}</dl>;
export function RecordDetail() {
  const { entity, id } = useParams(); const nav = useNavigate(); const { can } = useAdmin();
  const { data: r, reload } = useFetch<any>(`/${entity}/${id}`);
  const [confirm, setConfirm] = useState(false); const [edit, setEdit] = useState<any>(null);
  if (!r) return <p className="text-slate-400">Loading…</p>;
  const remove = async (reason: string) => { await del(`/${entity}/${r.id}`, { reason }); toast.success('Moved to Bin'); nav(-1); };
  const save = async () => { try { await patch(`/${entity}/${r.id}`, edit); toast.success('Saved'); setEdit(null); reload(); } catch (e) { toast.error((e as Error).message); } };
  const editable: Record<string, string[]> = { clients: ['name', 'location', 'email'], requirements: ['location', 'amount', 'status'], properties: ['location', 'otherFeatures'], deals: ['dealValue', 'commissionPercent', 'notes'] };
  return (
    <div className="space-y-6" data-testid={`admin-${entity}-detail`}>
      <H title={`${r.code} · ${r.name || human(r.type || r.stage || r.category)}`} sub={`Managed by PC: ${r.owner?.name ?? '—'} (${r.owner?.pcCode ?? ''})`}>
        {r.deletedAt && <Pill v="IN_BIN" />}
        {can('records:write') && editable[entity!] && !r.deletedAt && <Btn variant="secondary" onClick={() => setEdit(Object.fromEntries(editable[entity!].map((k) => [k, r[k] ?? ''])))} data-testid="record-edit-btn">Edit</Btn>}
        {can('records:write') && entity === 'properties' && <Btn variant="secondary" onClick={async () => { await post(`/properties/${r.id}/deactivate`); toast.success('Status changed'); reload(); }} data-testid="property-toggle-active-btn">{r.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}</Btn>}
        {can('records:write') && entity !== 'deals' && !r.deletedAt && <Btn variant="danger" onClick={() => setConfirm(true)} data-testid="record-delete-btn">Delete</Btn>}
      </H>
      <Panel title="Details">
        {entity === 'clients' && <KV o={r} keys={[['Phone', (x) => x.phone], ['Location', (x) => x.location], ['Email', (x) => x.email], ['Requirements', (x) => x.requirements.map((q: any) => q.code).join(', ')], ['Created', (x) => date(x.createdAt)]]} />}
        {entity === 'requirements' && <KV o={r} keys={[['Requirement ID', (x) => <Code>{x.code}</Code>], ['Client', (x) => <Link className="text-blue-700" to={`/clients/${x.client.id}`}>{x.client.name}</Link>], ['Type', (x) => human(x.type)], ['Category', (x) => `${human(x.category)} · ${x.subtype ?? ''}`], ['Location', (x) => x.location], ['Budget', (x) => inr(x.amount)], ['BHK', (x) => x.bhk], ['Status', (x) => <Pill v={x.status} />], ['Created', (x) => date(x.createdAt)]]} />}
        {entity === 'properties' && <KV o={r} keys={[['Category', (x) => `${human(x.category)} · ${x.subCategory ? `${x.subCategory} · ` : ''}${x.subtype}`], ['Location', (x) => x.location], ['Area', (x) => x.area && `${Math.round(x.area)} sqft`], ['Dimensions', (x) => x.dimLength && `${x.dimLength} × ${x.dimWidth} ${x.dimUnit}`], ['Transactions', (x) => x.transactions.map((t: any) => `${human(t.kind)} ${inr(txPrice(t))}`).join(' · ')], ['Status', (x) => <Pill v={x.status} />]]} />}
        {entity === 'deals' && <KV o={r} keys={[['Client', (x) => x.client.name], ['Requirement', (x) => <Link className="text-blue-700" to={`/requirements/${x.requirement.id}`}>{x.requirement.code}</Link>], ['Property', (x) => <Link className="text-blue-700" to={`/properties/${x.property.id}`}>{x.property.code}</Link>], ['Stage', (x) => <Pill v={x.stage} />], ['Deal Value', (x) => inr(x.dealValue)], ['Expected Commission', (x) => inr(x.expectedCommission)], ['Final Commission', (x) => inr(x.finalCommission)], ['Closing Date', (x) => date(x.closingDate)]]} />}
      </Panel>
      {entity === 'properties' && <div className="grid grid-cols-2 gap-4">
        <Panel title="Linked Clients"><Table testid="linked-clients-table" cols={[{ h: 'Client', r: (x) => <Link className="text-blue-700" to={`/clients/${x.client.id}`}>{x.client.name}</Link> }, { h: 'Requirement', r: (x) => <Link className="text-blue-700" to={`/requirements/${x.requirement.id}`}>{x.requirement.code}</Link> }, { h: 'Interest', r: (x) => human(x.interestLevel) }]} rows={r.links} /></Panel>
        <Panel title="Deals"><Table cols={[{ h: 'Deal', r: (x) => <Link className="text-blue-700" to={`/deals/${x.id}`}>{x.code}</Link> }, { h: 'Client', r: (x) => x.client.name }, { h: 'Stage', r: (x) => <Pill v={x.stage} /> }]} rows={r.deals} /></Panel>
        <Panel title="Shares" className="col-span-2"><Table cols={[{ h: 'Date', r: (x) => dt(x.createdAt) }, { h: 'Sender', r: (x) => x.sender?.name }, { h: 'Target', r: (x) => human(x.targetType) }, { h: 'Receiver', r: (x) => x.receiver?.name || x.receiverPhone }, { h: 'Permission', r: (x) => human(x.permission) }, { h: 'Channel', r: (x) => human(x.channel) }, { h: 'Status', r: (x) => <Pill v={x.status} /> }]} rows={r.shares} /></Panel></div>}
      {entity === 'requirements' && <Panel title="Top Matches"><Table cols={[{ h: 'Property', r: (x) => <Code>{x.property.code}</Code> }, { h: 'Location', r: (x) => x.property.location }, { h: 'Score', r: (x) => <b>{x.score}%</b> }]} rows={r.matches} /></Panel>}
      {entity === 'deals' && <Panel title="Stage History"><Table cols={[{ h: 'When', r: (x) => dt(x.createdAt) }, { h: 'From', r: (x) => human(x.fromStage) }, { h: 'To', r: (x) => human(x.toStage) }, { h: 'By', r: (x) => x.changedBy }, { h: 'Note', r: (x) => x.note }]} rows={r.history} /></Panel>}
      <Panel title="Activity Timeline"><Table testid="record-timeline" cols={[{ h: 'When', r: (x) => dt(x.createdAt) }, { h: 'Action', r: (x) => human(x.action) }, { h: 'Description', r: (x) => x.description }]} rows={r.timeline || []} /></Panel>
      <Confirm open={confirm} title="Move to Bin" text="The record will be moved to the Bin and can be restored later." withReason onClose={() => setConfirm(false)} onConfirm={remove} />
      <Modal open={!!edit} title={`Edit ${r.code}`} onClose={() => setEdit(null)} footer={<Btn onClick={save} data-testid="record-save-btn">Save</Btn>}>
        {edit && Object.keys(edit).map((k) => <label key={k} className="block text-xs font-bold text-slate-600">{human(k)}<In className="mt-1 w-full" value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: ['amount', 'dealValue', 'commissionPercent'].includes(k) ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })} data-testid={`edit-${k}-input`} /></label>)}
      </Modal>
    </div>
  );
}

const COLORS = ['#1D4ED8', '#0B132B', '#60A5FA', '#10B981', '#F59E0B', '#94A3B8', '#6366F1', '#EF4444', '#0EA5E9'];
const Chart = ({ title, children }: { title: string; children: React.ReactElement }) => <Panel title={title}><div className="h-60"><ResponsiveContainer>{children}</ResponsiveContainer></div></Panel>;
const PieC = ({ data }: { data: any[] }) => <PieChart><Pie data={data.map((d) => ({ ...d, name: human(d.name) }))} dataKey="value" nameKey="name" outerRadius={85} innerRadius={45} label>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>;
function AnalyticsView({ a }: { a: any }) {
  const t = a.totals;
  return (
    <div className="space-y-4" data-testid="analytics-view">
      <div className="grid grid-cols-6 gap-4">{[['Properties', t.totalProperties], ['Clients', t.totalClients], ['Requirements', t.totalRequirements], ['Matches', t.matches ?? '—'], ['Shares', t.propertyShares ?? '—'], ['Site Visits', t.siteVisits], ['Deals', t.deals], ['Closed', t.closedDeals], ['Deal Value', inr(t.dealValue)], ['Expected', inr(t.expectedCommission)], ['Earned', inr(t.earnedCommission)], ['Active Req.', t.activeRequirements]].map(([l, v]) => <Metric key={l} label={l} value={v} />)}</div>
      <div className="grid grid-cols-2 gap-4">
        <Chart title="Growth (monthly)"><LineChart data={a.growth}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip />{['properties', 'clients', 'requirements', 'deals'].map((k, i) => <Line key={k} dataKey={k} stroke={COLORS[i]} strokeWidth={2} />)}</LineChart></Chart>
        <Chart title="Commission Growth"><BarChart data={a.growth}><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => inr(v)} width={70} /><Tooltip formatter={(v: any) => inr(v)} /><Bar dataKey="commission" fill="#10B981" radius={[4, 4, 0, 0]} /></BarChart></Chart>
        <Chart title="Deal Funnel"><BarChart data={a.dealFunnel.map((x: any) => ({ ...x, stage: human(x.stage) }))} layout="vertical"><XAxis type="number" allowDecimals={false} fontSize={11} /><YAxis type="category" dataKey="stage" width={150} fontSize={11} /><Tooltip /><Bar dataKey="count" fill="#1D4ED8" radius={[0, 4, 4, 0]} /></BarChart></Chart>
        <Chart title="Follow-ups"><PieC data={a.followUpCompletion} /></Chart>
        <Chart title="Property Distribution"><PieC data={a.propertyDistribution} /></Chart>
        <Chart title="Transaction Distribution"><PieC data={a.transactionDistribution} /></Chart>
        <Chart title="Requirement Distribution"><PieC data={a.clientDistribution} /></Chart>
        <Chart title="Location Distribution"><BarChart data={a.locations}><XAxis dataKey="name" fontSize={10} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="value" fill="#0B132B" radius={[4, 4, 0, 0]} /></BarChart></Chart>
      </div>
    </div>
  );
}
export function Analytics() {
  const [f, setF] = useState<any>({ range: '1y' }); const pcs = useFetch<any[]>('/pcs', { pageSize: 100 });
  const { data } = useFetch<any>('/analytics', f);
  return (
    <div><H title="Platform Analytics"><ExportBtn e="analytics" /></H>
      <div className="mb-4 flex flex-wrap gap-2" data-testid="analytics-filters">
        <Sel value={f.range} onChange={(e) => setF({ ...f, range: e.target.value })} data-testid="analytics-range">{[['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['3m', '3 Months'], ['6m', '6 Months'], ['1y', '1 Year'], ['custom', 'Custom'], ['', 'All time']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
        {f.range === 'custom' && <><In type="date" value={f.from || ''} onChange={(e) => setF({ ...f, from: e.target.value })} /><In type="date" value={f.to || ''} onChange={(e) => setF({ ...f, to: e.target.value })} /></>}
        <Sel value={f.pcId || ''} onChange={(e) => setF({ ...f, pcId: e.target.value })} data-testid="analytics-pc"><option value="">All PCs</option>{pcs.data?.map((p) => <option key={p.id} value={p.id}>{p.name || p.phone}</option>)}</Sel>
        <In placeholder="Location" value={f.location || ''} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <Sel value={f.category || ''} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">All property types</option>{CATEGORIES.map((c) => <option key={c} value={c}>{human(c)}</option>)}</Sel>
        <Sel value={f.kind || ''} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">All transactions</option>{['SALE', 'RENT', 'LEASE'].map((c) => <option key={c} value={c}>{human(c)}</option>)}</Sel>
      </div>
      {data ? <AnalyticsView a={data} /> : <p className="text-slate-400">Loading…</p>}</div>
  );
}

export function Activity() {
  const [kind, setKind] = useState('pc');
  const cols = kind === 'audit' ? [{ h: 'When', r: (x: any) => dt(x.createdAt) }, { h: 'Admin', r: (x: any) => x.admin?.name ?? '—' }, { h: 'Action', r: (x: any) => human(x.action) }, { h: 'Entity', r: (x: any) => `${x.entityType ?? ''} ${x.entityCode ?? ''}` }, { h: 'Requirement', r: (x: any) => x.requirementCode ? <Code>{x.requirementCode}</Code> : '' }, { h: 'IP', r: (x: any) => x.ip }]
    : kind === 'logins' ? [{ h: 'When', r: (x: any) => dt(x.createdAt) }, { h: 'Email', r: (x: any) => x.email }, { h: 'Result', r: (x: any) => <Pill v={x.success ? 'ACTIVE' : 'MISSED'} /> }, { h: 'Reason', r: (x: any) => x.reason }, { h: 'IP', r: (x: any) => x.ip }]
      : [{ h: 'When', r: (x: any) => dt(x.createdAt) }, { h: 'PC', r: (x: any) => x.user?.name }, { h: 'Action', r: (x: any) => human(x.action) }, { h: 'Description', r: (x: any) => x.description }, { h: 'Requirement', r: (x: any) => x.requirementCode ? <Code>{x.requirementCode}</Code> : '' }];
  return (
    <div><H title="Activity & Audit Logs" sub="Audit records are append-only (enforced in the database)">
      <Sel value={kind} onChange={(e) => setKind(e.target.value)} data-testid="activity-kind"><option value="pc">PC Activity</option><option value="audit">Admin Audit Log</option><option value="logins">Admin Login Attempts</option></Sel></H>
      <ListPage key={kind} path="/activity" extra={{ kind }} cols={cols} /></div>
  );
}

export function Bin() {
  const { can } = useAdmin(); const [k, setK] = useState(0); const [purge, setPurge] = useState<any>(null);
  const restore = async (x: any) => { try { const r = await post(`/bin/${x.id}/restore`); toast.success(`Restored ${r.code || r.name}`); setK(k + 1); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div key={k}><H title="Platform Bin" sub="Restore keeps original IDs. Permanent deletion requires typing DELETE PERMANENTLY." />
      <ListPage path="/bin" filters={[{ k: 'entityType', label: 'Entity', opts: ['CLIENT', 'REQUIREMENT', 'PROPERTY', 'DEAL'] }]}
        cols={[{ h: 'Entity', r: (x) => human(x.entityType) }, { h: 'Original ID', r: (x) => <Code>{x.entityCode || x.entityId}</Code> }, { h: 'Label', r: (x) => x.label }, { h: 'PC', r: (x) => <PcCell o={x.owner} /> }, { h: 'Deleted', r: (x) => dt(x.deletedAt) }, { h: 'By', r: (x) => x.deletedByType }, { h: 'Reason', r: (x) => x.reason ?? '—' },
          { h: 'Actions', r: (x) => <div className="flex gap-2">{can('bin:restore') && <Btn variant="secondary" onClick={() => restore(x)} data-testid={`admin-bin-restore-${x.entityCode}`}>Restore</Btn>}{can('bin:purge') && <Btn variant="danger" onClick={() => setPurge(x)} data-testid={`admin-bin-purge-${x.entityCode}`}>Delete</Btn>}</div> }]} />
      <Confirm open={!!purge} title="Permanent deletion" text={`${purge?.entityCode || purge?.label} will be permanently deleted. Its ID will never be reused.`} phrase="DELETE PERMANENTLY" onClose={() => setPurge(null)} onConfirm={async (_r, typed) => { await post(`/bin/${purge.id}/purge`, { confirmText: typed }); toast.success('Permanently deleted'); setK(k + 1); }} />
    </div>
  );
}

function MasterList({ path, title, fields }: { path: string; title: string; fields: string[] }) {
  const { can } = useAdmin(); const { data, reload } = useFetch<any[]>(path); const [f, setF] = useState<any>(null);
  const save = async () => { try { f.id ? await patch(`${path}/${f.id}`, Object.fromEntries(fields.map((k) => [k, f[k] ?? '']))) : await post(path, f); toast.success('Saved'); setF(null); reload(); } catch (e) { toast.error((e as Error).message); } };
  const toggle = async (x: any) => { await patch(`${path}/${x.id}`, { active: !x.active }); reload(); };
  return (
    <div><H title={title}>{can('master:write') && <Btn onClick={() => setF({ city: 'Bengaluru' })} data-testid={`add-${title.toLowerCase()}-btn`}><Plus className="h-4 w-4" />Add</Btn>}</H>
      <Panel><Table cols={[...fields.map((k) => ({ h: human(k), r: (x: any) => x[k] || '—' })), { h: 'Status', r: (x: any) => <Pill v={x.active ? 'ACTIVE' : 'INACTIVE'} /> }, { h: '', r: (x: any) => can('master:write') && <div className="flex gap-2"><Btn variant="ghost" onClick={() => setF(x)}>Edit</Btn><Btn variant="secondary" onClick={() => toggle(x)} data-testid={`toggle-${x.id}`}>{x.active ? 'Deactivate' : 'Activate'}</Btn></div> }]} rows={data || []} /></Panel>
      <Modal open={!!f} title={f?.id ? 'Edit' : 'Add'} onClose={() => setF(null)} footer={<Btn onClick={save} data-testid="master-save-btn">Save</Btn>}>{f && fields.map((k) => <In key={k} className="w-full" placeholder={human(k)} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`master-${k}-input`} />)}</Modal></div>
  );
}
export const Locations = () => <MasterList path="/locations" title="Locations" fields={['city', 'area', 'locality', 'pincode']} />;
export const Amenities = () => <MasterList path="/amenities" title="Amenities" fields={['name']} />;

export function Settings() {
  const { can } = useAdmin(); const { data, reload } = useFetch<any>('/settings'); const [pending, setPending] = useState<any>(null); const [vals, setVals] = useState<Record<string, any>>({});
  useEffect(() => { if (data) setVals(Object.fromEntries(data.settings.map((s: any) => [s.key, s.value]))); }, [data]);
  if (!data) return <p className="text-slate-400">Loading…</p>;
  const cats = [...new Set(data.settings.map((s: any) => s.category))] as string[];
  return (
    <div className="space-y-6" data-testid="settings-page"><H title="System Settings" sub="Secrets live in server environment variables and are always masked." />
      <div className="grid grid-cols-2 gap-4">{cats.map((c) => <Panel key={c} title={c}>{data.settings.filter((s: any) => s.category === c).map((s: any) => (
        <div key={s.key} className="flex items-center justify-between gap-3 py-2"><span className="font-mono text-xs">{s.key}</span>
          <div className="flex gap-2">{typeof s.value === 'boolean' ? <Sel value={String(vals[s.key])} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value === 'true' })} disabled={!can('settings:write')}><option value="true">On</option><option value="false">Off</option></Sel>
            : <In className="w-40" value={vals[s.key] ?? ''} onChange={(e) => setVals({ ...vals, [s.key]: typeof s.value === 'number' ? Number(e.target.value) : e.target.value })} disabled={!can('settings:write')} data-testid={`setting-${s.key}`} />}
            {can('settings:write') && vals[s.key] !== s.value && <Btn onClick={() => setPending({ key: s.key, value: vals[s.key] })} data-testid={`setting-save-${s.key}`}>Save</Btn>}</div></div>))}</Panel>)}</div>
      <Panel title="Providers (OTP, WhatsApp, Email, SMS, Push, File Storage)"><Table testid="providers-table" cols={[{ h: 'Kind', r: (x) => <b>{x.kind}</b> }, { h: 'Active Provider', r: (x) => x.activeProvider }, { h: 'Enabled', r: (x) => <Pill v={x.enabled ? 'ACTIVE' : 'DISABLED'} /> }, { h: 'Secrets (env)', r: (x) => x.secrets.map((s: any) => <div key={s.name} className="font-mono text-xs">{s.name}: {s.configured ? s.masked : 'not set'}</div>) }]} rows={data.providers} /></Panel>
      <Confirm open={!!pending} danger={false} title="Change system configuration" text={`Set ${pending?.key} to ${JSON.stringify(pending?.value)}? This affects every PC on the platform.`} onClose={() => setPending(null)} onConfirm={async () => { await put(`/settings/${pending.key}`, { value: pending.value, confirm: true }); toast.success('Setting updated'); reload(); }} />
    </div>
  );
}

export function AdminUsers() {
  const { can, admin } = useAdmin(); const { data, reload, error } = useFetch<any[]>(can('admins:manage') ? '/users' : null); const [f, setF] = useState<any>(null);
  if (!can('admins:manage')) return <Panel><p className="text-sm text-slate-500" data-testid="admins-forbidden">Only SUPER_ADMIN can manage administrators.</p></Panel>;
  const save = async () => { try { await post('/users', f); toast.success('Administrator created'); setF(null); reload(); } catch (e) { toast.error((e as Error).message); } };
  const upd = async (x: any, body: any) => { try { await patch(`/users/${x.id}`, body); reload(); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div><H title="Admin Users"><Btn onClick={() => setF({ role: 'ADMIN' })} data-testid="add-admin-btn"><Plus className="h-4 w-4" />Add Admin</Btn></H>{error && <p className="text-red-600">{error}</p>}
      <Panel><Table cols={[{ h: 'Name', r: (x) => <b>{x.name}</b> }, { h: 'Email', r: (x) => x.email }, { h: 'Role', r: (x) => <Sel value={x.role} disabled={x.id === (admin && admin.id)} onChange={(e) => upd(x, { role: e.target.value })}>{['SUPER_ADMIN', 'ADMIN', 'SUPPORT_ADMIN', 'READ_ONLY_ADMIN'].map((r) => <option key={r}>{r}</option>)}</Sel> }, { h: 'Status', r: (x) => <Pill v={x.status} /> }, { h: 'Created', r: (x) => date(x.createdAt) }, { h: 'Last Login', r: (x) => dt(x.lastLoginAt) }, { h: '', r: (x) => x.id !== (admin && admin.id) && <Btn variant="secondary" onClick={() => upd(x, { status: x.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>{x.status === 'ACTIVE' ? 'Disable' : 'Enable'}</Btn> }]} rows={data || []} /></Panel>
      <Modal open={!!f} title="Add administrator" onClose={() => setF(null)} footer={<Btn onClick={save} data-testid="admin-create-submit">Create</Btn>}>{f && <>{['name', 'email', 'password'].map((k) => <In key={k} type={k === 'password' ? 'password' : 'text'} className="w-full" placeholder={human(k)} value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={`new-admin-${k}`} />)}
        <Sel className="w-full" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{['SUPER_ADMIN', 'ADMIN', 'SUPPORT_ADMIN', 'READ_ONLY_ADMIN'].map((r) => <option key={r}>{r}</option>)}</Sel></>}</Modal></div>
  );
}

export function Profile() {
  const { admin } = useAdmin(); const [cur, setCur] = useState(''); const [nw, setNw] = useState('');
  if (!admin) return null;
  const change = async () => { try { await post('/auth/change-password', { currentPassword: cur, newPassword: nw }); toast.success('Password changed'); setCur(''); setNw(''); } catch (e) { toast.error((e as Error).message); } };
  return (
    <div className="max-w-xl space-y-4"><H title="My Profile" /><Panel><p className="font-bold">{admin.name}</p><p className="text-sm text-slate-500">{admin.email} · {admin.role}</p><p className="mt-3 text-xs text-slate-500">Permissions: {admin.permissions.join(', ')}</p></Panel>
      <Panel title="Change password"><div className="space-y-2"><In type="password" className="w-full" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} /><In type="password" className="w-full" placeholder="New password (min 10 chars)" value={nw} onChange={(e) => setNw(e.target.value)} /><Btn onClick={change}>Update password</Btn></div></Panel>
      <Panel title="Two-factor authentication"><p className="text-sm text-slate-500">2FA-ready architecture: TOTP enrolment can be enabled per administrator (twoFactorEnabled flag on the account).</p></Panel></div>
  );
}

export function SearchPage() {
  const [sp] = useSearchParams(); const q = sp.get('q') || '';
  const { data } = useFetch<any>(q.length >= 2 ? '/search' : null, { q });
  if (!data) return <p className="text-slate-400">Type at least 2 characters in the search bar.</p>;
  const g: [string, any[], (x: any) => [string, string, string, any]][] = [
    ['PCs', data.pcs, (x) => [`/pcs/${x.id}`, x.pcCode, `${x.name} · ${x.phone}`, null]], ['Clients', data.clients, (x) => [`/clients/${x.id}`, x.code, `${x.name} · ${x.phone} · ${x.location}`, x.owner]],
    ['Properties', data.properties, (x) => [`/properties/${x.id}`, x.code, `${x.subtype} · ${x.location}`, x.owner]], ['Requirements', data.requirements, (x) => [`/requirements/${x.id}`, x.code, `${human(x.type)} · ${x.client.name} · ${x.location}`, x.owner]],
    ['Deals', data.deals, (x) => [`/deals/${x.id}`, x.code, `${x.client.name} · ${human(x.stage)}`, x.owner]], ['Follow-ups', data.followUps, (x) => ['/follow-ups', x.code, `${human(x.type)} · ${x.client.name}`, x.owner]],
  ];
  return (
    <div className="space-y-4" data-testid="admin-search-results"><H title={`Results for “${q}”`} />
      {g.filter(([, rows]) => rows.length).map(([t, rows, f]) => <Panel key={t} title={`${t} (${rows.length})`}><Table cols={[{ h: 'Type', r: () => t }, { h: 'ID', r: (x) => <Link className="text-blue-700" to={f(x)[0]}><Code>{f(x)[1]}</Code></Link> }, { h: 'Summary', r: (x) => f(x)[2] }, { h: 'Owning PC', r: (x) => <PcCell o={f(x)[3]} /> }]} rows={rows} /></Panel>)}
    </div>
  );
}

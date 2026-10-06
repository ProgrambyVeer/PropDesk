import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, RotateCcw, Trash2 } from 'lucide-react';
import { del, post } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { ago, dt, human } from '../lib/format';
import { Button, Card, Empty, ErrorState, ListSkeleton, Mono, Tabs } from '../components/ui';
import { Timeline } from '../components/domain';

export function Notifications() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'inbox' | 'scheduled'>('inbox');
  const inbox = useFetch<any[]>(tab === 'inbox' ? '/notifications' : null, { pageSize: 50 });
  const sched = useFetch<any[]>(tab === 'scheduled' ? '/notifications/scheduled' : null);
  const read = async (n: any) => { if (n.status !== 'READ') await post(`/notifications/${n.id}/read`); window.dispatchEvent(new Event('notifications:changed')); if (n.link) nav(n.link.split('?')[0]); };
  const all = async () => { await post('/notifications/read-all'); inbox.reload(); window.dispatchEvent(new Event('notifications:changed')); };
  const enable = async () => { if (!('Notification' in window)) return toast.error('Browser notifications not supported'); const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Browser notifications enabled' : 'Permission not granted'); };
  const list = tab === 'inbox' ? inbox : sched;
  return (
    <div className="space-y-5" data-testid="notifications-page">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-3xl font-extrabold tracking-tight">Notifications</h1>
        <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={enable} data-testid="enable-browser-notifications-btn"><Bell className="h-4 w-4" />Enable browser alerts</Button>{tab === 'inbox' && <Button size="sm" variant="ghost" onClick={all} data-testid="mark-all-read-btn">Mark all read</Button>}</div></div>
      <Tabs tabs={[{ id: 'inbox', label: 'Inbox' }, { id: 'scheduled', label: 'Scheduled' }]} value={tab} onChange={setTab} testid="notifications-tab" />
      {list.error ? <ErrorState message={list.error} /> : list.loading && !list.data ? <ListSkeleton /> : !list.data?.length ? <Empty title={tab === 'inbox' ? 'You are all caught up' : 'No scheduled reminders'} /> :
        <Card className="divide-y divide-slate-100">{list.data.map((n) => (
          <button key={n.id} onClick={() => read(n)} className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50" data-testid={`notification-${n.code}`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.status === 'DELIVERED' ? 'bg-brand' : n.status === 'PENDING' ? 'bg-amber-400' : 'bg-slate-200'}`} />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{n.title}</p><p className="text-xs text-slate-500">{n.body}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{human(n.type)} · {tab === 'inbox' ? ago(n.deliveredAt || n.createdAt) : `Fires ${dt(n.scheduledFor)}`}</p></div>
          </button>))}</Card>}
    </div>
  );
}

export function Bin() {
  const { data, loading, error, reload } = useFetch<any[]>('/bin');
  const [busy, setBusy] = useState<string | null>(null);
  const restore = async (b: any) => { setBusy(b.id); try { const r = await post(`/bin/${b.id}/restore`); toast.success(`Restored ${r.code || r.name}`); reload(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); } };
  const purge = async (b: any) => { if (!confirm(`Permanently delete ${b.entityCode || b.label}? This cannot be undone. The ID will never be reused.`)) return; await del(`/bin/${b.id}`); toast.success('Permanently deleted'); reload(); };
  return (
    <div className="space-y-5" data-testid="bin-page">
      <div><h1 className="text-3xl font-extrabold tracking-tight">Bin</h1><p className="text-sm text-slate-500">Restored records keep their original IDs.</p></div>
      {error ? <ErrorState message={error} /> : loading && !data ? <ListSkeleton /> : !data?.length ? <Empty title="Bin is empty" icon={<Trash2 className="h-6 w-6" />} /> :
        <Card className="divide-y divide-slate-100">{data.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4" data-testid={`bin-item-${b.entityCode || b.entityId}`}>
            <div><p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{human(b.entityType)}</p><p className="text-sm font-semibold">{b.label}</p><p className="text-xs text-slate-500">{b.entityCode && <Mono>{b.entityCode}</Mono>} Deleted {dt(b.deletedAt)} by {b.deletedByType === 'PC' ? 'you' : 'admin'}{b.reason ? ` · ${b.reason}` : ''}</p></div>
            <div className="flex gap-2"><Button size="sm" variant="secondary" loading={busy === b.id} onClick={() => restore(b)} data-testid={`bin-restore-${b.entityCode || b.entityId}`}><RotateCcw className="h-3.5 w-3.5" />Restore</Button>
              <Button size="sm" variant="ghost" onClick={() => purge(b)} data-testid={`bin-purge-${b.entityCode || b.entityId}`}><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button></div>
          </div>))}</Card>}
    </div>
  );
}

const ENTITY = ['', 'CLIENT', 'REQUIREMENT', 'PROPERTY', 'DEAL', 'FOLLOW_UP', 'LINK'];
export function Activity() {
  const [type, setType] = useState('');
  const { data, loading } = useFetch<any[]>('/activity-logs', { entityType: type, pageSize: 100 });
  return (
    <div className="space-y-5" data-testid="activity-page">
      <h1 className="text-3xl font-extrabold tracking-tight">Activity Logs</h1>
      <Tabs tabs={ENTITY.map((e) => ({ id: e, label: e ? human(e) : 'All' }))} value={type} onChange={setType} testid="activity-filter" />
      <Card className="p-5">{loading && !data ? <ListSkeleton /> : <Timeline items={data ?? []} testid="activity-timeline" />}</Card>
    </div>
  );
}

export function Help() {
  const faqs = [
    ['How do Requirement IDs work?', 'Every requirement gets a permanent ID like REQ-000123 generated by the server. It never changes, is kept after deletion and restoration, and is never reused.'],
    ['Can one client have several requirements?', 'Yes. Each requirement is independent — editing or deleting one never affects the others, and each has its own matches, follow-ups and deals.'],
    ['How does sharing work?', 'Share a property with a client or another consultant. Registered numbers get an in-app notification with view-only access; other numbers can be shared via WhatsApp.'],
    ['What happens when I reschedule a follow-up?', 'The date/time is updated and the reminder notifications are moved to the new time.'],
  ];
  return <div className="space-y-4" data-testid="help-page"><h1 className="text-3xl font-extrabold tracking-tight">Help</h1>{faqs.map(([q, a]) => <Card key={q} className="p-5"><p className="font-bold">{q}</p><p className="mt-1 text-sm text-slate-600">{a}</p></Card>)}</div>;
}

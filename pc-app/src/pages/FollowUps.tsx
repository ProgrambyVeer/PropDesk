import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, CalendarClock, Check, MessageCircle, Pencil, Phone, Plus, Trash2, X } from 'lucide-react';
import { del, get, post } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { dt, human, toLocalInput } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorState, Field, Input, ListSkeleton, Mono, Sheet, Tabs, Textarea } from '../components/ui';
import { FollowUpSheet } from '../components/domain';

const TONE: Record<string, string> = { SCHEDULED: 'blue', RESCHEDULED: 'violet', COMPLETED: 'green', MISSED: 'red', CANCELLED: 'slate' };

export default function FollowUps() {
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<string>('upcoming');
  const { data, loading, error, reload } = useFetch<any[]>('/follow-ups', { view: view === 'all' ? '' : view, pageSize: 100 });
  const [form, setForm] = useState<any>(null);
  const [resched, setResched] = useState<any>(null);
  const [complete, setComplete] = useState<any>(null);
  useEffect(() => { if (sp.get('new')) { setForm({}); setSp({}, { replace: true }); } }, [sp, setSp]);
  const changed = () => { reload(); window.dispatchEvent(new Event('notifications:changed')); };
  const cancel = async (f: any) => { if (!confirm(`Cancel ${f.code}?`)) return; await post(`/follow-ups/${f.id}/cancel`); toast.success('Follow-up cancelled'); changed(); };
  const remove = async (f: any) => { if (!confirm(`Delete ${f.code}?`)) return; await del(`/follow-ups/${f.id}`); toast.success('Follow-up deleted'); changed(); };
  const whatsapp = async (f: any) => { const r = await get(`/follow-ups/${f.id}/whatsapp`); window.open(r.url, '_blank'); };
  return (
    <div className="space-y-5" data-testid="followups-page">
      <div className="flex items-end justify-between"><h1 className="text-3xl font-extrabold tracking-tight">Follow Ups</h1><Button onClick={() => setForm({})} data-testid="add-followup-btn"><Plus className="h-4 w-4" />New</Button></div>
      <Tabs tabs={[{ id: 'today', label: 'Today' }, { id: 'upcoming', label: 'Upcoming' }, { id: 'overdue', label: 'Missed' }, { id: 'completed', label: 'Completed' }, { id: 'all', label: 'All' }]} value={view} onChange={setView} testid="followup-view" />
      {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <ListSkeleton /> : !data?.length ? <Empty title="Nothing here" text="Schedule calls, WhatsApps, meetings and site visits." icon={<CalendarClock className="h-6 w-6" />} /> :
        <div className="space-y-3">{data.map((f) => {
          const open = f.status === 'SCHEDULED' || f.status === 'RESCHEDULED' || f.status === 'MISSED';
          const reminder = new Date(new Date(f.scheduledAt).getTime() - f.reminderMinutes * 60000);
          return (
            <Card key={f.id} className="p-4" data-testid={`followup-card-${f.code}`}>
              <div className="flex items-start justify-between gap-3">
                <div><div className="flex items-center gap-2"><Badge tone={TONE[f.status]}>{human(f.status)}</Badge><Mono>{f.code}</Mono></div>
                  <p className="mt-2 font-bold">{human(f.type)} · {f.client.name}</p>
                  <p className="text-sm text-slate-500" data-testid={`followup-time-${f.code}`}>{dt(f.scheduledAt)}{f.requirement ? ` · ${f.requirement.code}` : ''}{f.property ? ` · ${f.property.code}` : ''}</p>
                  {open && f.status !== 'MISSED' && <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand-600" data-testid={`followup-reminder-${f.code}`}><Bell className="h-3 w-3" />Reminder {dt(reminder)}</p>}
                  {f.notes && <p className="mt-2 text-sm text-slate-600">{f.notes}</p>}{f.outcome && <p className="mt-1 text-sm text-emerald-700">Outcome: {f.outcome}</p>}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <a href={`tel:+91${f.client.phone}`}><Button size="sm" variant="secondary"><Phone className="h-3.5 w-3.5" />Call</Button></a>
                <Button size="sm" variant="secondary" onClick={() => whatsapp(f)} data-testid={`followup-whatsapp-${f.code}`}><MessageCircle className="h-3.5 w-3.5 text-emerald-600" />WhatsApp Client</Button>
                {open && <><Button size="sm" variant="success" onClick={() => setComplete(f)} data-testid={`followup-complete-${f.code}`}><Check className="h-3.5 w-3.5" />Complete</Button>
                  <Button size="sm" variant="secondary" onClick={() => setResched(f)} data-testid={`followup-reschedule-${f.code}`}><CalendarClock className="h-3.5 w-3.5" />Reschedule</Button>
                  <Button size="sm" variant="ghost" onClick={() => setForm(f)} data-testid={`followup-edit-${f.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => cancel(f)} data-testid={`followup-cancel-${f.code}`}><X className="h-3.5 w-3.5" /></Button></>}
                <Button size="sm" variant="ghost" onClick={() => remove(f)} data-testid={`followup-delete-${f.code}`}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
              </div>
            </Card>);
        })}</div>}
      <FollowUpSheet open={!!form} onClose={() => setForm(null)} initial={form} onDone={changed} />
      <RescheduleSheet f={resched} onClose={() => setResched(null)} onDone={changed} />
      <CompleteSheet f={complete} onClose={() => setComplete(null)} onDone={changed} />
    </div>
  );
}

function RescheduleSheet({ f, onClose, onDone }: { f: any; onClose: () => void; onDone: () => void }) {
  const [when, setWhen] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (f) { setWhen(toLocalInput(new Date(Math.max(Date.now(), new Date(f.scheduledAt).getTime()) + 86400e3))); setReason(''); setErr(''); } }, [f]);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await post(`/follow-ups/${f.id}/reschedule`, { scheduledAt: new Date(when).toISOString(), reason });
      const remind = new Date(new Date(r.scheduledAt).getTime() - r.reminderMinutes * 60000);
      toast.success('Follow-up rescheduled', { description: `You'll be notified ${dt(remind)}` }); onDone(); onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!f} onClose={onClose} title={`Reschedule ${f?.code ?? ''}`} testid="reschedule-sheet" footer={<Button className="w-full" onClick={save} loading={busy} data-testid="reschedule-save-btn">Reschedule</Button>}>
      <div className="space-y-4"><Field label="New Date & Time" required error={err}><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} data-testid="reschedule-datetime-input" /></Field>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reschedule-reason-input" /></Field>
        <p className="text-xs text-slate-500">Reminder notifications move to the new time automatically.</p></div>
    </Sheet>
  );
}
function CompleteSheet({ f, onClose, onDone }: { f: any; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await post(`/follow-ups/${f.id}/complete`, { outcome }); toast.success('Marked complete'); setOutcome(''); onDone(); onClose(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); } };
  return (
    <Sheet open={!!f} onClose={onClose} title={`Complete ${f?.code ?? ''}`} testid="complete-sheet" footer={<Button variant="success" className="w-full" onClick={save} loading={busy} data-testid="complete-save-btn">Mark Complete</Button>}>
      <Field label="Outcome"><Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Client liked the property, wants a second visit" data-testid="complete-outcome-input" /></Field>
    </Sheet>
  );
}

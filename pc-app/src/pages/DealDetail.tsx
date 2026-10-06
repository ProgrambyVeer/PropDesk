import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRight, Trash2 } from 'lucide-react';
import { ApiError, del, patch, post } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { date, human, inr, STAGES, STAGE_TONE } from '../lib/format';
import { Badge, Button, Card, ErrorState, Field, Input, KV, ListSkeleton, Mono, Section, Sheet, Textarea } from '../components/ui';
import { FollowUpSheet, Stat, Timeline } from '../components/domain';

export default function DealDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: d, loading, error, reload } = useFetch<any>(`/deals/${id}`);
  const [target, setTarget] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [comm, setComm] = useState<any>(null);
  const [fu, setFu] = useState<any>(null);
  useEffect(() => { if (d) setComm({ dealValue: d.dealValue ?? '', commissionPercent: d.commissionPercent ?? '', commissionFixed: d.commissionFixed ?? '' }); }, [d]);
  if (error) return <ErrorState message={error} />;
  if (loading || !d || !comm) return <ListSkeleton />;
  const n = (v: any) => (v === '' || v == null ? null : Number(v));
  const open = (s: string) => { setTarget(s); setErrs({}); setForm({ dealValue: d.dealValue ?? '', commissionPercent: d.commissionPercent ?? '', finalCommission: '', closingDate: new Date().toISOString().slice(0, 10), note: '', lossReason: '' }); };
  const move = async () => {
    setBusy(true);
    try {
      await post(`/deals/${d.id}/stage`, { stage: target, note: form.note, ...(target === 'CLOSED' ? { dealValue: n(form.dealValue), commissionPercent: n(form.commissionPercent), finalCommission: n(form.finalCommission), closingDate: form.closingDate } : {}), ...(target === 'LOST' ? { lossReason: form.lossReason } : {}) });
      toast.success(`Moved to ${human(target!)}`); setTarget(null); reload();
    } catch (e) { setErrs((e as ApiError).fieldErrors); toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const saveComm = async () => { try { await patch(`/deals/${d.id}`, { dealValue: n(comm.dealValue), commissionPercent: n(comm.commissionPercent), commissionFixed: n(comm.commissionFixed) }); toast.success('Commission updated'); reload(); } catch (e) { toast.error((e as Error).message); } };
  const remove = async () => { if (!confirm(`Move ${d.code} to Bin?`)) return; await del(`/deals/${d.id}`); toast.success('Deal moved to Bin'); nav('/deals'); };
  const idx = STAGES.indexOf(d.stage);
  const preview = n(comm.commissionFixed) ?? (n(comm.dealValue) && n(comm.commissionPercent) != null ? Math.round(n(comm.dealValue)! * n(comm.commissionPercent)! / 100) : null);
  return (
    <div className="space-y-6" data-testid="deal-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Mono className="text-sm">{d.code}</Mono><h1 className="mt-1 text-2xl font-extrabold tracking-tight">{d.client.name} · {d.property.subtype}</h1>
          <p className="text-sm text-slate-500"><Link to={`/requirements/${d.requirement.id}`} className="font-semibold text-brand">{d.requirement.code}</Link> · <Link to={`/properties/${d.property.id}`} className="font-semibold text-brand">{d.property.code}</Link> · {d.property.location}</p></div>
        <div className="flex gap-2"><Badge tone={STAGE_TONE[d.stage]} className="px-3 py-1 text-xs" >{human(d.stage)}</Badge><Button variant="ghost" size="sm" onClick={remove} data-testid="deal-delete-btn"><Trash2 className="h-4 w-4 text-red-600" /></Button></div>
      </div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto" data-testid="deal-stepper">{STAGES.filter((s) => s !== 'LOST').map((s, i) => <div key={s} className={`h-1.5 min-w-[32px] flex-1 rounded-full ${d.stage === 'LOST' ? 'bg-red-200' : i <= idx ? 'bg-navy' : 'bg-slate-200'}`} title={human(s)} />)}</div>
      {d.stage !== 'CLOSED' && d.stage !== 'LOST' && <div className="flex flex-wrap gap-2">
        {STAGES.slice(idx + 1, -2).slice(0, 1).map((s) => <Button key={s} onClick={() => open(s)} data-testid="deal-next-stage-btn">Move to {human(s)}<ChevronRight className="h-4 w-4" /></Button>)}
        <select className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold" value="" onChange={(e) => e.target.value && open(e.target.value)} data-testid="deal-stage-select"><option value="">Change stage…</option>{STAGES.filter((s) => s !== d.stage).map((s) => <option key={s} value={s}>{human(s)}</option>)}</select>
        <Button variant="success" onClick={() => open('CLOSED')} data-testid="deal-close-btn">Close Deal</Button><Button variant="secondary" onClick={() => open('LOST')} data-testid="deal-lost-btn">Mark Lost</Button>
        <Button variant="secondary" onClick={() => setFu({ clientId: d.clientId, requirementId: d.requirementId, propertyId: d.propertyId, dealId: d.id })} data-testid="deal-followup-btn">Add Follow-up</Button>
      </div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Stat label="Deal Value" value={inr(d.dealValue)} testid="deal-value" /><Stat label="Commission %" value={d.commissionPercent != null ? `${d.commissionPercent}%` : '—'} /><Stat label="Expected Commission" value={inr(d.expectedCommission)} accent testid="deal-expected-commission" /><Stat label="Final Commission" value={inr(d.finalCommission)} accent testid="deal-final-commission" /></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Commission"><Card className="space-y-3 p-5">
          <div className="grid grid-cols-3 gap-3"><Field label="Deal Value (₹)"><Input type="number" value={comm.dealValue} onChange={(e) => setComm({ ...comm, dealValue: e.target.value })} data-testid="comm-value-input" /></Field>
            <Field label="Percentage"><Input type="number" step="0.1" value={comm.commissionPercent} onChange={(e) => setComm({ ...comm, commissionPercent: e.target.value })} data-testid="comm-percent-input" /></Field>
            <Field label="Fixed (₹)"><Input type="number" value={comm.commissionFixed} onChange={(e) => setComm({ ...comm, commissionFixed: e.target.value })} data-testid="comm-fixed-input" /></Field></div>
          <p className="text-sm">Expected commission: <b data-testid="comm-preview">{inr(preview)}</b></p><Button variant="secondary" onClick={saveComm} data-testid="comm-save-btn">Save Commission</Button>
        </Card></Section>
        <Section title="Details"><Card className="divide-y divide-slate-100 px-5 py-2"><KV k="Probability" v={`${d.probability}%`} /><KV k="Closing Date" v={date(d.closingDate)} />{d.lossReason && <KV k="Loss Reason" v={d.lossReason} />}<KV k="Notes" v={d.notes} /><KV k="Created" v={date(d.createdAt)} /></Card></Section>
      </div>
      <Section title="Stage History"><Card className="p-5"><ol className="space-y-3" data-testid="deal-history">{d.history.map((h: any) => <li key={h.id} className="text-sm"><b>{h.fromStage ? `${human(h.fromStage)} → ` : ''}{human(h.toStage)}</b><span className="text-slate-500"> · {date(h.createdAt)}{h.note ? ` · ${h.note}` : ''}</span></li>)}</ol></Card></Section>
      <Section title="Deal Timeline"><Card className="p-5"><Timeline items={d.timeline} testid="deal-timeline" /></Card></Section>
      <Sheet open={!!target} onClose={() => setTarget(null)} title={`Move to ${human(target || '')}`} testid="stage-sheet" footer={<Button className="w-full" onClick={move} loading={busy} data-testid="stage-confirm-btn">Confirm</Button>}>
        <div className="space-y-4">
          {target === 'CLOSED' && <><Field label="Deal Value (₹)" required error={errs.dealValue}><Input type="number" value={form.dealValue} onChange={(e) => setForm({ ...form, dealValue: e.target.value })} data-testid="close-value-input" /></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Commission %"><Input type="number" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} data-testid="close-percent-input" /></Field>
              <Field label="Final Commission (₹)" error={errs.finalCommission} hint="Leave blank to compute from %"><Input type="number" value={form.finalCommission} onChange={(e) => setForm({ ...form, finalCommission: e.target.value })} data-testid="close-final-input" /></Field></div>
            <Field label="Closing Date" required error={errs.closingDate}><Input type="date" value={form.closingDate} onChange={(e) => setForm({ ...form, closingDate: e.target.value })} data-testid="close-date-input" /></Field></>}
          {target === 'LOST' && <Field label="Loss Reason" required error={errs.lossReason}><Textarea value={form.lossReason} onChange={(e) => setForm({ ...form, lossReason: e.target.value })} data-testid="lost-reason-input" /></Field>}
          <Field label="Notes"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} data-testid="stage-note-input" /></Field>
        </div>
      </Sheet>
      <FollowUpSheet open={!!fu} onClose={() => setFu(null)} initial={fu} onDone={reload} />
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { token } from './lib/api';

const API = `${String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/v1/admin`;
export async function downloadCsv(entity: string) {
  const r = await fetch(`${API}/export/${entity}`, { headers: { Authorization: `Bearer ${token.get()}` } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error?.message || 'Export failed');
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement('a'); a.href = url; a.download = `${entity}.csv`; a.click(); URL.revokeObjectURL(url);
}

export const Btn = ({ variant = 'primary', loading, className, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean }) => (
  <button {...p} disabled={p.disabled || loading} className={clsx('inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors disabled:opacity-50',
    variant === 'primary' && 'bg-blue-700 text-white hover:bg-blue-800', variant === 'secondary' && 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
    variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700', variant === 'ghost' && 'text-slate-600 hover:bg-slate-100', className)}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}</button>
);
export const In = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={clsx('h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100', p.className)} />;
export const Sel = ({ children, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={clsx('h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm', p.className)}>{children}</select>;
export const Panel = ({ title, children, action, className }: { title?: string; children: ReactNode; action?: ReactNode; className?: string }) => (
  <div className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>{title && <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><h3 className="text-sm font-bold">{title}</h3>{action}</div>}<div className="p-5">{children}</div></div>
);
const TONE: Record<string, string> = { ACTIVE: 'bg-emerald-50 text-emerald-700', CLOSED: 'bg-emerald-50 text-emerald-700', COMPLETED: 'bg-emerald-50 text-emerald-700', DELIVERED: 'bg-blue-50 text-blue-700', SUSPENDED: 'bg-amber-50 text-amber-700', MISSED: 'bg-red-50 text-red-700', LOST: 'bg-red-50 text-red-700', DEACTIVATED: 'bg-slate-200 text-slate-700', INACTIVE: 'bg-slate-200 text-slate-700', DISABLED: 'bg-slate-200 text-slate-700', PENDING: 'bg-amber-50 text-amber-700', IN_BIN: 'bg-amber-50 text-amber-700' };
export const Pill = ({ v }: { v?: string | null }) => (v ? <span className={clsx('rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', TONE[v] || 'bg-slate-100 text-slate-700')}>{v.replace(/_/g, ' ')}</span> : null);
export const Code = ({ children }: { children: ReactNode }) => <span className="font-mono text-xs font-semibold text-blue-700">{children}</span>;

export function Table({ cols, rows, onRow, testid = 'data-table' }: { cols: { h: string; r: (x: any) => ReactNode }[]; rows: any[]; onRow?: (x: any) => void; testid?: string }) {
  return (
    <div className="overflow-x-auto" data-testid={testid}>
      <table className="w-full text-sm"><thead className="bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500"><tr>{cols.map((c) => <th key={c.h} className="whitespace-nowrap px-4 py-2.5">{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((x, i) => <tr key={x.id || i} onClick={() => onRow?.(x)} className={clsx('border-t border-slate-100', onRow && 'cursor-pointer hover:bg-slate-50')} data-testid={`row-${x.code || x.pcCode || x.id}`}>{cols.map((c) => <td key={c.h} className="whitespace-nowrap px-4 py-2.5">{c.r(x)}</td>)}</tr>)}</tbody></table>
      {!rows.length && <p className="p-8 text-center text-sm text-slate-500" data-testid="table-empty">No records found.</p>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" data-testid="modal">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-3"><h3 className="font-bold">{title}</h3><button onClick={onClose} data-testid="modal-close-btn"><X className="h-5 w-5 text-slate-400" /></button></div>
        <div className="space-y-3 p-5">{children}</div>{footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}</div>
    </div>
  );
}

// Destructive action confirmation. When `phrase` is set the admin must type it exactly.
export function Confirm({ open, title, text, phrase, withReason, onClose, onConfirm, danger = true }: { open: boolean; title: string; text: string; phrase?: string; withReason?: boolean; onClose: () => void; onConfirm: (reason: string, typed: string) => Promise<void>; danger?: boolean }) {
  const [typed, setTyped] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); try { await onConfirm(reason, typed); setTyped(''); setReason(''); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <Modal open={open} title={title} onClose={onClose} footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant={danger ? 'danger' : 'primary'} loading={busy} disabled={(!!phrase && typed !== phrase) || (withReason && !reason)} onClick={go} data-testid="confirm-action-btn">Confirm</Btn></>}>
      <p className="text-sm text-slate-600">{text}</p>
      {withReason && <In className="w-full" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="confirm-reason-input" />}
      {phrase && <><p className="text-xs font-semibold text-slate-500">Type <b className="font-mono text-red-600">{phrase}</b> to confirm</p><In className="w-full font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="confirm-phrase-input" /></>}
      {err && <p className="text-sm text-red-600" data-testid="confirm-error">{err}</p>}
    </Modal>
  );
}
export const Metric = ({ label, value, testid }: { label: string; value: ReactNode; testid?: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={testid}><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p></div>
);

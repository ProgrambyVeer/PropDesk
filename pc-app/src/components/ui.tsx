import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Loader2, X, Inbox } from 'lucide-react';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; loading?: boolean; size?: 'sm' | 'md' | 'lg' };
export function Button({ variant = 'primary', loading, size = 'md', className, children, disabled, ...p }: BtnProps) {
  return (
    <button {...p} disabled={disabled || loading} className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,transform,box-shadow] duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
      size === 'sm' ? 'h-9 px-3 text-sm' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-11 px-4 text-sm',
      variant === 'primary' && 'bg-navy text-white hover:bg-navy-800 shadow-sm',
      variant === 'secondary' && 'bg-white text-navy border border-slate-200 hover:bg-slate-50',
      variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
      variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-700', className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}{children}
    </button>
  );
}

export function Field({ label, required, error, hint, children, className }: { label?: string; required?: boolean; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}{required && <span className="ml-0.5 text-red-500">*</span>}</span>}
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-red-600" data-testid="field-error">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
const inputCls = (err?: boolean) => clsx('w-full rounded-xl border bg-white px-3.5 text-[15px] text-navy placeholder:text-slate-400 transition-[border-color,box-shadow] focus:outline-none focus:ring-4', err ? 'border-red-400 focus:ring-red-100' : 'border-slate-200 focus:border-brand focus:ring-brand-100');
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ invalid, className, ...p }, ref) => <input ref={ref} {...p} className={clsx(inputCls(invalid), 'h-11', className)} />);
export const Textarea = ({ invalid, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) => <textarea rows={3} {...p} className={clsx(inputCls(invalid), 'py-2.5', className)} />;
export const Select = ({ invalid, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) => <select {...p} className={clsx(inputCls(invalid), 'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 fill=%27none%27 stroke=%27%2364748B%27 stroke-width=%272%27%3E%3Cpath d=%27M2 4l4 4 4-4%27/%3E%3C/svg%3E")] bg-[right_14px_center] bg-no-repeat pr-9', className)}>{children}</select>;

export function Chips<T extends string>({ options, value, onChange, label = (x: T) => x, testid }: { options: readonly T[]; value?: T | null; onChange: (v: T) => void; label?: (v: T) => string; testid?: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <button type="button" role="radio" aria-checked={value === o} key={o} onClick={() => onChange(o)} data-testid={`${testid}-${o.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          className={clsx('h-10 rounded-full border px-4 text-sm font-semibold transition-colors', value === o ? 'border-navy bg-navy text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>{label(o)}</button>
      ))}
    </div>
  );
}

export const Card = ({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => <div {...p} className={clsx('rounded-2xl border border-slate-200/80 bg-white shadow-card', className)}>{children}</div>;

const TONES: Record<string, string> = { slate: 'bg-slate-100 text-slate-700', blue: 'bg-brand-50 text-brand-600', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600', violet: 'bg-indigo-50 text-indigo-700', navy: 'bg-navy text-white' };
export const Badge = ({ tone = 'slate', children, className }: { tone?: string; children: ReactNode; className?: string }) => <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider', TONES[tone], className)}>{children}</span>;
export const Mono = ({ children, className }: { children: ReactNode; className?: string }) => <span className={clsx('font-mono text-[12px] font-semibold text-brand-600', className)}>{children}</span>;

export function Sheet({ open, onClose, title, children, footer, testid }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; testid?: string }) {
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-testid={testid}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg animate-sheet flex-col rounded-t-3xl bg-white shadow-lift sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" data-testid="sheet-close-btn" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-slate-100 px-5 py-3 pb-safe">{footer}</div>}
      </div>
    </div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={clsx('skeleton rounded-xl', className)} />;
export const ListSkeleton = ({ n = 4 }: { n?: number }) => <div className="space-y-3" data-testid="loading-skeleton">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center" data-testid="empty-state">
      <div className="mb-3 rounded-2xl bg-slate-50 p-3 text-slate-400">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const ErrorState = ({ message, retry }: { message: string; retry?: () => void }) => (
  <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700" data-testid="error-state">{message}{retry && <button className="ml-2 font-semibold underline" onClick={retry}>Retry</button>}</div>
);

export function Tabs<T extends string>({ tabs, value, onChange, testid = 'tab' }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void; testid?: string }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)} data-testid={`${testid}-${t.id}`}
          className={clsx('whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors', value === t.id ? 'bg-navy text-white' : 'text-slate-500 hover:bg-slate-100')}>
          {t.label}{t.count != null && <span className="ml-1.5 opacity-60">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export const Section = ({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={clsx('min-w-0 animate-up', className)}>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold tracking-tight md:text-lg">{title}</h2>{action}</div>
    {children}
  </section>
);
export const KV = ({ k, v }: { k: string; v: ReactNode }) => <div className="flex justify-between gap-3 py-2 text-sm"><span className="text-slate-500">{k}</span><span className="text-right font-semibold">{v ?? '—'}</span></div>;

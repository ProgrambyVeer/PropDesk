import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, request } from './api';

export function useFetch<T = any>(path: string | null, query?: Record<string, unknown>) {
  const [data, setData] = useState<T | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify([path, query]);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setLoading(true); setError(null);
    try {
      const r = await request<T>(path, { query });
      if (id === seq.current) { setData(r.data); setMeta(r.meta); }
    } catch (e) {
      if (id === seq.current) setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => { load(); }, [load]);
  return { data, meta, loading, error, reload: load, setData };
}

// Wraps an async action: prevents duplicate submissions and collects field errors.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    if (busy) return;
    setBusy(true); setErrors({});
    try { return await fn(); } catch (e) {
      if (e instanceof ApiError) { setErrors(e.fieldErrors); throw e; }
      throw e;
    } finally { setBusy(false); }
  };
  return { busy, errors, setErrors, run };
}

export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

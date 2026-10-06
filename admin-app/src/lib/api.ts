const API = `${String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api/v1`;
const ORIGIN = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'admin_token';

export const token = { get: () => localStorage.getItem(TOKEN_KEY), set: (t: string) => localStorage.setItem(TOKEN_KEY, t), clear: () => localStorage.removeItem(TOKEN_KEY) };
export const fileUrl = (u?: string | null) => (!u ? '' : u.startsWith('/') ? `${ORIGIN}${u}` : u);

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors: Record<string, string> = {}) { super(message); }
}

type Opts = { method?: string; body?: unknown; query?: Record<string, unknown> };
export async function request<T = any>(path: string, opts: Opts = {}): Promise<{ data: T; meta?: any }> {
  const qs = opts.query ? `?${new URLSearchParams(Object.entries(opts.query).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => [k, String(v)]))}` : '';
  let res: Response;
  try {
    res = await fetch(`${API}/admin${path}${qs}`, {
      method: opts.method || 'GET',
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(token.get() ? { Authorization: `Bearer ${token.get()}` } : {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Network error. Check your connection.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    const e = json.error || {};
    const fe: Record<string, string> = {};
    for (const [k, v] of Object.entries(e.details?.fieldErrors || {})) fe[k] = (v as string[])[0];
    if (res.status === 401 && token.get()) { token.clear(); window.dispatchEvent(new Event('admin:expired')); }
    if (res.status === 403 && String(e.code).startsWith('ACCOUNT_')) { token.clear(); window.dispatchEvent(new CustomEvent('admin:blocked', { detail: e.message })); }
    throw new ApiError(res.status, e.code || 'ERROR', e.message || 'Something went wrong', fe);
  }
  return json;
}
export const get = <T = any>(p: string, q?: Record<string, unknown>) => request<T>(p, { query: q }).then((r) => r.data);
export const post = <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: body ?? {} }).then((r) => r.data);
export const patch = <T = any>(p: string, body: unknown) => request<T>(p, { method: 'PATCH', body }).then((r) => r.data);
export const put = <T = any>(p: string, body: unknown) => request<T>(p, { method: 'PUT', body }).then((r) => r.data);
export const del = <T = any>(p: string, body?: unknown) => request<T>(p, { method: 'DELETE', body }).then((r) => r.data);

export function upload(path: string, field: string, files: File[], onProgress?: (pct: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    files.forEach((f) => fd.append(field, f));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API}${path}`);
    if (token.get()) xhr.setRequestHeader('Authorization', `Bearer ${token.get()}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      const json = JSON.parse(xhr.responseText || '{}');
      xhr.status < 300 ? resolve(json.data) : reject(new ApiError(xhr.status, json.error?.code, json.error?.message || 'Upload failed'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Upload failed. Check your connection.'));
    xhr.send(fd);
  });
}

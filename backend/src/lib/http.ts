import type { Response } from 'express';
import type { ZodType } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = (m = 'You do not have access to this resource') => new AppError(403, 'FORBIDDEN', m);
export const badRequest = (m: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', m, details);
export const conflict = (m: string) => new AppError(409, 'CONFLICT', m);
export const unauthorized = (m = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', m);

export const ok = (res: Response, data: unknown, meta?: unknown, status = 200) =>
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const flat = r.error.flatten();
    throw new AppError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields', flat);
  }
  return r.data;
}

export function fieldError(fieldErrors: Record<string, string>) {
  const fe: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(fieldErrors)) fe[k] = [v];
  return new AppError(422, 'VALIDATION_ERROR', Object.values(fieldErrors)[0], { fieldErrors: fe, formErrors: [] });
}

export function paging(q: Record<string, unknown>, sortable: string[], defSort = 'createdAt') {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 20));
  const sort = sortable.includes(String(q.sort)) ? String(q.sort) : defSort;
  const order: 'asc' | 'desc' = q.order === 'asc' ? 'asc' : 'desc';
  return { skip: (page - 1) * pageSize, take: pageSize, orderBy: { [sort]: order } };
}
export const pageMeta = (total: number, p: { skip: number; take: number }) => ({
  total, page: p.skip / p.take + 1, pageSize: p.take, totalPages: Math.max(1, Math.ceil(total / p.take)),
});

export const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
export const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });

export function normalizePhone(raw: string) {
  const digits = String(raw || '').replace(/\D/g, '');
  const p = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
  return p;
}
export const isIndianMobile = (p: string) => /^[6-9]\d{9}$/.test(p);

export function inr(n?: number | null) {
  if (n == null) return '-';
  const t = (x: number) => (Math.round(x * 100) / 100).toString();
  if (n >= 1e7) return `₹${t(n / 1e7)} Cr`;
  if (n >= 1e5) return `₹${t(n / 1e5)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

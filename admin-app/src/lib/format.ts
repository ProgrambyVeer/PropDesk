export function inr(n?: number | null, full = false) {
  if (n == null || isNaN(n)) return '—';
  const t = (x: number) => (Math.round(x * 100) / 100).toString();
  if (!full && n >= 1e7) return `₹${t(n / 1e7)} Cr`;
  if (!full && n >= 1e5) return `₹${t(n / 1e5)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
export const dt = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const date = (d?: string | Date | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const time = (d?: string | Date | null) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');
export const ago = (d: string | Date) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
export const human = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '');
export const initials = (n?: string | null) => (n || '?').split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
export const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export const REQ_TYPES = ['BUY_LOOKING', 'SELL_OFFERING', 'RENT_LOOKING', 'RENT_OFFERING', 'LEASE_LOOKING', 'LEASE_OFFERING'];
export const CATEGORIES = ['RESIDENTIAL', 'COMMERCIAL', 'LAND'];
export const SUBTYPES: Record<string, string[]> = { RESIDENTIAL: ['Standalone', 'Independent', 'Apartment'], COMMERCIAL: ['Shop', 'Store', 'Land', 'Storehouse'], LAND: ['Agricultural', 'Commercial', 'Residential', 'Empty Land', 'Farmhouse'] };
export const COMMERCIAL_CATS = ['Full Commercial', 'Semi Commercial'];
export const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];
export const FURNISHING = ['Unfurnished', 'Semi Furnished', 'Fully Furnished'];
export const AGES = ['New', '1-5 years', '5-10 years', '10+ years'];
export const STAGES = ['NEW', 'CONTACTED', 'INTERESTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED', 'NEGOTIATION', 'DOCUMENTATION', 'CLOSED', 'LOST'];
export const FU_TYPES = ['CALL', 'WHATSAPP', 'SITE_VISIT', 'MEETING', 'OTHER'];
export const AMOUNT_LABEL: Record<string, string> = { BUY_LOOKING: 'Budget', SELL_OFFERING: 'Expected Sale Price', RENT_LOOKING: 'Rent Budget', RENT_OFFERING: 'Rent Amount', LEASE_LOOKING: 'Lease Budget', LEASE_OFFERING: 'Lease Amount' };
export const txPrice = (t: any) => (t.kind === 'SALE' ? t.salePrice : t.kind === 'RENT' ? t.rentAmount : t.leaseAmount);
export const txLabel = (t: any) => `${human(t.kind)} ${inr(txPrice(t))}${t.kind !== 'SALE' ? (t.kind === 'RENT' ? '/mo' : '') : ''}`;
export const dims = (x: any) => (x?.dimLength && x?.dimWidth ? `${x.dimLength} × ${x.dimWidth} ${x.dimUnit === 'METERS' ? 'm' : 'ft'}` : '—');
export const STAGE_TONE: Record<string, string> = { NEW: 'slate', CONTACTED: 'blue', INTERESTED: 'blue', SITE_VISIT_SCHEDULED: 'amber', SITE_VISIT_COMPLETED: 'amber', NEGOTIATION: 'violet', DOCUMENTATION: 'violet', CLOSED: 'green', LOST: 'red' };

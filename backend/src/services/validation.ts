import { z } from 'zod';
import { DimensionUnit, PropertyCategory, RequirementStatus, RequirementType, TransactionKind, PropertyStatus } from '@prisma/client';
import { fieldError } from '../lib/http';

const empty = (v: unknown) => v === '' || v === null || v === undefined;
export const optNum = z.preprocess((v) => (empty(v) ? null : Number(v)), z.number().finite().nonnegative().nullable()).optional();
export const optInt = z.preprocess((v) => (empty(v) ? null : Number(v)), z.number().int().nonnegative().nullable()).optional();
export const optStr = z.preprocess((v) => (empty(v) ? null : String(v).trim()), z.string().max(2000).nullable()).optional();
export const optDate = z.preprocess((v) => (empty(v) ? null : new Date(v as string)), z.date().nullable()).optional();

export const RESIDENTIAL_SUBTYPES = ['Standalone', 'Independent', 'Apartment'];
export const COMMERCIAL_CATEGORIES = ['Full Commercial', 'Semi Commercial'];
export const COMMERCIAL_SUBTYPES = ['Shop', 'Store', 'Land', 'Storehouse'];
export const LAND_SUBTYPES = ['Agricultural', 'Commercial', 'Residential', 'Empty Land', 'Farmhouse'];

const dims = { dimLength: optNum, dimWidth: optNum, dimUnit: z.nativeEnum(DimensionUnit).optional() };

/* ---------------- Requirements ---------------- */
export const requirementSchema = z.object({
  type: z.nativeEnum(RequirementType),
  category: z.nativeEnum(PropertyCategory),
  subCategory: optStr, subtype: optStr,
  location: z.string().trim().min(2, 'Location is required').max(120),
  locality: optStr, bhk: optInt, bathrooms: optInt, area: optNum, ...dims,
  amountMin: optNum, amount: optNum, deposit: optNum, leasePeriodMonths: optInt, availableDate: optDate,
  facing: optStr, floor: optInt, totalFloors: optInt, furnishing: optStr, propertyAge: optStr, parking: optStr,
  amenities: z.array(z.string().max(60)).max(40).optional(), khata: optStr, transactionType: optStr, availability: optStr,
  otherRequirements: optStr, status: z.nativeEnum(RequirementStatus).optional(),
});
export type RequirementInput = z.infer<typeof requirementSchema>;

const REQ_FIELDS: Record<PropertyCategory, string[]> = {
  RESIDENTIAL: ['subtype', 'locality', 'bhk', 'bathrooms', 'area', 'facing', 'floor', 'totalFloors', 'amenities', 'furnishing', 'propertyAge', 'parking'],
  COMMERCIAL: ['subCategory', 'subtype', 'locality', 'area', 'facing', 'transactionType', 'availability'],
  LAND: ['subtype', 'locality', 'area', 'khata', 'facing'],
};
const REQ_TX_FIELDS: Record<RequirementType, string[]> = {
  BUY_LOOKING: ['amountMin', 'amount'], SELL_OFFERING: ['amount'],
  RENT_LOOKING: ['amountMin', 'amount', 'deposit', 'availableDate'], RENT_OFFERING: ['amount', 'deposit', 'availableDate'],
  LEASE_LOOKING: ['amountMin', 'amount', 'deposit', 'leasePeriodMonths', 'availableDate'], LEASE_OFFERING: ['amount', 'deposit', 'leasePeriodMonths', 'availableDate'],
};
const ALL_REQ_OPTIONAL = ['subCategory', 'subtype', 'locality', 'bhk', 'bathrooms', 'area', 'amountMin', 'amount', 'deposit', 'leasePeriodMonths', 'availableDate', 'facing', 'floor', 'totalFloors', 'furnishing', 'propertyAge', 'parking', 'amenities', 'khata', 'transactionType', 'availability'];

export const AMOUNT_LABEL: Record<RequirementType, string> = {
  BUY_LOOKING: 'Budget', SELL_OFFERING: 'Expected sale price', RENT_LOOKING: 'Rent budget', RENT_OFFERING: 'Rent amount',
  LEASE_LOOKING: 'Lease budget', LEASE_OFFERING: 'Lease amount',
};

const sqft = (l?: number | null, w?: number | null, unit?: DimensionUnit) =>
  l && w ? Math.round(l * w * (unit === 'METERS' ? 10.7639 : 1)) : null;

function checkSubtype(category: PropertyCategory, subCategory: any, subtype: any, errors: Record<string, string>) {
  if (category === 'RESIDENTIAL' && !RESIDENTIAL_SUBTYPES.includes(subtype)) errors.subtype = 'Choose Standalone, Independent or Apartment';
  if (category === 'COMMERCIAL') {
    if (!COMMERCIAL_CATEGORIES.includes(subCategory)) errors.subCategory = 'Choose Full Commercial or Semi Commercial';
    if (!COMMERCIAL_SUBTYPES.includes(subtype)) errors.subtype = 'Choose Shop, Store, Land or Storehouse';
  }
  if (category === 'LAND' && !LAND_SUBTYPES.includes(subtype)) errors.subtype = 'Choose a valid land type';
}

// Returns a full, sanitized record: fields irrelevant to the category / transaction type are nulled.
export function normalizeRequirement(input: RequirementInput) {
  const allowed = new Set([...REQ_FIELDS[input.category], ...REQ_TX_FIELDS[input.type]]);
  const out: any = { type: input.type, category: input.category, location: input.location, otherRequirements: input.otherRequirements ?? null };
  for (const f of ALL_REQ_OPTIONAL) out[f] = allowed.has(f) ? ((input as any)[f] ?? (f === 'amenities' ? [] : null)) : (f === 'amenities' ? [] : null);
  out.dimLength = input.dimLength ?? null; out.dimWidth = input.dimWidth ?? null; out.dimUnit = input.dimUnit ?? 'FEET';
  if (input.status) out.status = input.status;
  const errors: Record<string, string> = {};
  checkSubtype(input.category, out.subCategory, out.subtype, errors);
  if (input.category === 'RESIDENTIAL' && (!out.dimLength || !out.dimWidth)) errors.dimLength = 'Dimensions (length × width) are required';
  if (!out.amount) errors.amount = `${AMOUNT_LABEL[input.type]} is required`;
  if (out.amountMin && out.amount && out.amountMin > out.amount) errors.amountMin = 'Minimum cannot exceed maximum';
  if (out.amount && out.amount > 5e9) errors.amount = 'Amount is too large';
  if ((input.type === 'LEASE_LOOKING' || input.type === 'LEASE_OFFERING') && !out.leasePeriodMonths) errors.leasePeriodMonths = 'Lease period is required';
  if ((input.type === 'RENT_OFFERING' || input.type === 'LEASE_OFFERING') && !out.availableDate) errors.availableDate = 'Available date is required';
  if (Object.keys(errors).length) throw fieldError(errors);
  if (!out.area && allowed.has('area')) out.area = sqft(out.dimLength, out.dimWidth, out.dimUnit);
  return out;
}

/* ---------------- Properties ---------------- */
export const transactionSchema = z.object({
  kind: z.nativeEnum(TransactionKind),
  salePrice: optNum, rentAmount: optNum, leaseAmount: optNum, depositAmount: optNum, leasePeriodMonths: optInt, availableDate: optDate,
  status: optStr,
});
export type TransactionInput = z.infer<typeof transactionSchema>;

export function normalizeTransaction(t: TransactionInput) {
  const errors: Record<string, string> = {};
  const base = { kind: t.kind, status: t.status || 'ACTIVE', salePrice: null as number | null, rentAmount: null as number | null, leaseAmount: null as number | null, depositAmount: null as number | null, leasePeriodMonths: null as number | null, availableDate: null as Date | null };
  if (t.kind === 'SALE') {
    base.salePrice = t.salePrice ?? null;
    if (!base.salePrice) errors[`SALE.salePrice`] = 'Sale price is required';
  } else if (t.kind === 'RENT') {
    Object.assign(base, { rentAmount: t.rentAmount ?? null, depositAmount: t.depositAmount ?? null, availableDate: t.availableDate ?? null });
    if (!base.rentAmount) errors['RENT.rentAmount'] = 'Rent amount is required';
    if (!base.availableDate) errors['RENT.availableDate'] = 'Available date is required';
  } else {
    Object.assign(base, { leaseAmount: t.leaseAmount ?? null, depositAmount: t.depositAmount ?? null, leasePeriodMonths: t.leasePeriodMonths ?? null, availableDate: t.availableDate ?? null });
    if (!base.leaseAmount) errors['LEASE.leaseAmount'] = 'Lease amount is required';
    if (!base.leasePeriodMonths) errors['LEASE.leasePeriodMonths'] = 'Lease period is required';
    if (!base.availableDate) errors['LEASE.availableDate'] = 'Available date is required';
  }
  if (Object.keys(errors).length) throw fieldError(errors);
  return base;
}

export const propertySchema = z.object({
  title: optStr,
  category: z.nativeEnum(PropertyCategory),
  subCategory: optStr, subtype: z.string().trim().min(1, 'Subtype is required'),
  location: z.string().trim().min(2, 'Location is required').max(120),
  locality: optStr, address: optStr, facing: optStr, area: optNum, builtUpArea: optNum, carpetArea: optNum, plotArea: optNum,
  bhk: optInt, bathrooms: optInt, balcony: optInt, parking: optStr, floor: optInt, totalFloors: optInt, furnishing: optStr, propertyAge: optStr,
  amenities: z.array(z.string().max(60)).max(40).optional(), ...dims, khata: optStr, otherFeatures: optStr,
  status: z.nativeEnum(PropertyStatus).optional(),
  transactions: z.array(transactionSchema).optional(),
});
export type PropertyInput = z.infer<typeof propertySchema>;

const PROP_FIELDS: Record<PropertyCategory, string[]> = {
  RESIDENTIAL: ['locality', 'facing', 'builtUpArea', 'carpetArea', 'plotArea', 'bhk', 'bathrooms', 'balcony', 'parking', 'floor', 'totalFloors', 'furnishing', 'propertyAge', 'amenities'],
  COMMERCIAL: ['subCategory', 'locality', 'area', 'facing'],
  LAND: ['locality', 'area', 'khata', 'facing'],
};
const ALL_PROP_OPTIONAL = ['subCategory', 'locality', 'facing', 'area', 'builtUpArea', 'carpetArea', 'plotArea', 'bhk', 'bathrooms', 'balcony', 'parking', 'floor', 'totalFloors', 'furnishing', 'propertyAge', 'amenities', 'khata'];

export function normalizeProperty(input: Omit<PropertyInput, 'transactions'>) {
  const allowed = new Set(PROP_FIELDS[input.category]);
  const out: any = {
    title: input.title ?? null, category: input.category, subtype: input.subtype, location: input.location, address: input.address ?? null,
    otherFeatures: input.otherFeatures ?? null, dimLength: input.dimLength ?? null, dimWidth: input.dimWidth ?? null, dimUnit: input.dimUnit ?? 'FEET',
  };
  for (const f of ALL_PROP_OPTIONAL) out[f] = allowed.has(f) ? ((input as any)[f] ?? (f === 'amenities' ? [] : null)) : (f === 'amenities' ? [] : null);
  if (input.status) out.status = input.status;
  const errors: Record<string, string> = {};
  checkSubtype(input.category, out.subCategory, out.subtype, errors);
  if (!out.dimLength || !out.dimWidth) errors.dimLength = 'Dimensions (length × width) are required';
  if (out.floor != null && out.totalFloors != null && out.floor > out.totalFloors) errors.floor = 'Floor cannot exceed total floors';
  if (Object.keys(errors).length) throw fieldError(errors);
  const dimArea = sqft(out.dimLength, out.dimWidth, out.dimUnit);
  if (input.category === 'RESIDENTIAL') {
    if (!out.plotArea) out.plotArea = dimArea;
    out.area = out.builtUpArea || out.carpetArea || out.plotArea;
  } else if (!out.area) out.area = dimArea;
  return out;
}

export function normalizeTransactions(list: TransactionInput[] | undefined) {
  if (!list || !list.length) throw fieldError({ transactions: 'Add at least one transaction type (Sale, Rent or Lease)' });
  const kinds = new Set<string>();
  return list.map((t) => {
    if (kinds.has(t.kind)) throw fieldError({ transactions: `Duplicate ${t.kind} transaction` });
    kinds.add(t.kind);
    return normalizeTransaction(t);
  });
}

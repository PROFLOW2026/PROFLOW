/**
 * Organization business catalog kinds and payment-term metadata helpers.
 * Framework-free domain.
 */

export const BUSINESS_CATALOG_KINDS = [
  'client_type',
  'vendor_category',
  'vendor_specialty',
  'payment_term',
  'cost_code',
  'lead_source',
  'lost_reason',
  'engagement_role',
] as const;

export type BusinessCatalogKind = (typeof BUSINESS_CATALOG_KINDS)[number];

export function isBusinessCatalogKind(value: string): value is BusinessCatalogKind {
  return (BUSINESS_CATALOG_KINDS as readonly string[]).includes(value);
}

/** Payment term derivation strategies (stored in metadata.strategy). */
export const PAYMENT_TERM_STRATEGIES = [
  'immediate',
  'net_days',
  'end_of_month',
  'eom_plus_days',
  'milestone',
  'custom',
] as const;

export type PaymentTermStrategy = (typeof PAYMENT_TERM_STRATEGIES)[number];

export interface PaymentTermMetadata {
  readonly strategy: PaymentTermStrategy;
  readonly netDays?: number;
  readonly eomOffsetDays?: number;
}

export interface CatalogEntryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly kind: BusinessCatalogKind;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly sortOrder: number;
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const MIGRATION_STRATEGY_ALIASES: Record<string, PaymentTermStrategy> = {
  due_on_receipt: 'immediate',
  net: 'net_days',
  eom_offset: 'eom_plus_days',
};

function normalizePaymentTermStrategy(raw: string): PaymentTermStrategy | null {
  if ((PAYMENT_TERM_STRATEGIES as readonly string[]).includes(raw)) {
    return raw as PaymentTermStrategy;
  }
  return MIGRATION_STRATEGY_ALIASES[raw] ?? null;
}

export function parsePaymentTermMetadata(
  metadata: Record<string, unknown> | null | undefined,
): PaymentTermMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const strategyRaw = metadata.strategy;
  if (typeof strategyRaw !== 'string') return null;
  const strategy = normalizePaymentTermStrategy(strategyRaw);
  if (!strategy) return null;
  const netDays = typeof metadata.netDays === 'number' ? metadata.netDays : undefined;
  const eomOffsetDays =
    typeof metadata.eomOffsetDays === 'number' ? metadata.eomOffsetDays : undefined;
  return {
    strategy,
    netDays,
    eomOffsetDays,
  };
}

export {
  resolveApPaymentTermId,
  resolveArPaymentTermId,
  resolveDocumentPaymentTermId,
  resolveInheritedPaymentTermId,
} from './resolve-payment-terms';

/**
 * Suggest due date from a payment term only when the caller left dueDate empty.
 * Never rewrites an existing due date (historical or user-entered).
 */
export function suggestDueDateFromPaymentTerm(input: {
  readonly baseDateIso: string;
  readonly dueDate?: string | null;
  readonly term: PaymentTermMetadata | null;
}): string | null {
  const existing = input.dueDate?.trim() || null;
  if (existing) return existing;
  if (!input.term) return null;
  return deriveDueDate(input.baseDateIso, input.term);
}

/**
 * Derive a due date from invoice/bill date + payment term.
 * Returns null for milestone/custom (user must set manually).
 */
export function deriveDueDate(
  baseDateIso: string,
  term: PaymentTermMetadata,
): string | null {
  const base = new Date(`${baseDateIso}T12:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;

  if (term.strategy === 'immediate') {
    return baseDateIso;
  }
  if (term.strategy === 'net_days') {
    const days = term.netDays ?? 0;
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString().slice(0, 10);
  }
  if (term.strategy === 'end_of_month') {
    const eom = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    return eom.toISOString().slice(0, 10);
  }
  if (term.strategy === 'eom_plus_days') {
    const eom = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));
    eom.setUTCDate(eom.getUTCDate() + (term.eomOffsetDays ?? 0));
    return eom.toISOString().slice(0, 10);
  }
  return null;
}

/** Universal default payment terms seeded for every org (unless already present). */
export const DEFAULT_PAYMENT_TERMS: readonly {
  readonly key: string;
  readonly name: string;
  readonly metadata: PaymentTermMetadata;
  readonly sortOrder: number;
}[] = [
  { key: 'immediate', name: 'Immediate', metadata: { strategy: 'immediate' }, sortOrder: 10 },
  { key: 'net_7', name: 'Net 7', metadata: { strategy: 'net_days', netDays: 7 }, sortOrder: 20 },
  { key: 'net_14', name: 'Net 14', metadata: { strategy: 'net_days', netDays: 14 }, sortOrder: 30 },
  { key: 'net_30', name: 'Net 30', metadata: { strategy: 'net_days', netDays: 30 }, sortOrder: 40 },
  { key: 'net_45', name: 'Net 45', metadata: { strategy: 'net_days', netDays: 45 }, sortOrder: 50 },
  { key: 'net_60', name: 'Net 60', metadata: { strategy: 'net_days', netDays: 60 }, sortOrder: 60 },
  { key: 'eom', name: 'End of month', metadata: { strategy: 'end_of_month' }, sortOrder: 70 },
  {
    key: 'eom_30',
    name: 'EOM + 30',
    metadata: { strategy: 'eom_plus_days', eomOffsetDays: 30 },
    sortOrder: 80,
  },
  {
    key: 'eom_45',
    name: 'EOM + 45',
    metadata: { strategy: 'eom_plus_days', eomOffsetDays: 45 },
    sortOrder: 90,
  },
  {
    key: 'eom_60',
    name: 'EOM + 60',
    metadata: { strategy: 'eom_plus_days', eomOffsetDays: 60 },
    sortOrder: 100,
  },
  { key: 'milestone', name: 'Milestone-based', metadata: { strategy: 'milestone' }, sortOrder: 110 },
  { key: 'custom', name: 'Custom', metadata: { strategy: 'custom' }, sortOrder: 120 },
];

export const DEFAULT_CLIENT_TYPES: readonly { readonly key: string; readonly name: string }[] = [
  { key: 'private', name: 'Private' },
  { key: 'company', name: 'Company' },
  { key: 'developer', name: 'Developer' },
  { key: 'main_contractor', name: 'Main contractor' },
  { key: 'property_manager', name: 'Property manager' },
  { key: 'municipality', name: 'Municipality' },
  { key: 'government', name: 'Government / Public' },
  { key: 'institution', name: 'Institution' },
  { key: 'building_committee', name: 'Building committee' },
  { key: 'architect', name: 'Architect' },
  { key: 'facility_company', name: 'Facility company' },
  { key: 'other', name: 'Other' },
];

export const DEFAULT_LEAD_SOURCES: readonly { readonly key: string; readonly name: string }[] = [
  { key: 'referral', name: 'Referral' },
  { key: 'website', name: 'Website' },
  { key: 'walk_in', name: 'Walk-in' },
  { key: 'tender', name: 'Tender' },
  { key: 'repeat', name: 'Repeat customer' },
  { key: 'partner', name: 'Partner' },
  { key: 'other', name: 'Other' },
];

export const DEFAULT_LOST_REASONS: readonly { readonly key: string; readonly name: string }[] = [
  { key: 'price', name: 'Price' },
  { key: 'timing', name: 'Timing' },
  { key: 'competitor', name: 'Competitor' },
  { key: 'scope', name: 'Scope mismatch' },
  { key: 'no_budget', name: 'No budget' },
  { key: 'no_response', name: 'No response' },
  { key: 'other', name: 'Other' },
];

export const DEFAULT_ENGAGEMENT_ROLES: readonly { readonly key: string; readonly name: string }[] = [
  { key: 'supplier', name: 'Supplier' },
  { key: 'subcontractor', name: 'Subcontractor' },
  { key: 'consultant', name: 'Consultant' },
  { key: 'installer', name: 'Installer' },
  { key: 'maintenance', name: 'Maintenance' },
];

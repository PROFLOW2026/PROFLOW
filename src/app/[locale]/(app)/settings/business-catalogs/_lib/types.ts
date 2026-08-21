/**
 * Client-safe shapes for Settings → Business Catalogs (no Date / drizzle).
 */
import {
  BUSINESS_CATALOG_KINDS,
  PAYMENT_TERM_STRATEGIES,
  type BusinessCatalogKind,
  type PaymentTermStrategy,
} from '@/modules/business-catalog/domain/types';

export type { BusinessCatalogKind, PaymentTermStrategy };
export { BUSINESS_CATALOG_KINDS, PAYMENT_TERM_STRATEGIES };

export interface CatalogEntryView {
  readonly id: string;
  readonly kind: BusinessCatalogKind;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly parentId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly sortOrder: number;
  readonly isSystem: boolean;
  readonly isActive: boolean;
}

export interface DocumentRequirementView {
  readonly id: string;
  readonly contextKind: 'vendor_type' | 'subcontract';
  readonly contextKey: string | null;
  readonly documentTypeKey: string;
  readonly label: string | null;
  readonly required: boolean;
  readonly isActive: boolean;
}

export const DOC_REQ_CONTEXT_KINDS = ['vendor_type', 'subcontract'] as const;
export const VENDOR_TYPE_CONTEXT_KEYS = ['supplier', 'subcontractor', 'both', 'other'] as const;

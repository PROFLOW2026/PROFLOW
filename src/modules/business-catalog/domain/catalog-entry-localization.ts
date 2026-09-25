/**
 * Unified display localization for system business-catalog entries.
 * DB keys/names stay canonical English; UI overlays by stable key at boundaries.
 */

import type { BusinessCatalogKind } from './types';
import { localizeClientTypeName, localizeClientTypeOptions } from './client-type-labels';
import { localizePaymentTermName, localizePaymentTermOptions } from './payment-term-labels';
import { localizeVendorCategoryName, localizeVendorCategoryOptions } from './vendor-capability-labels';
import {
  localizeEngagementRoleName,
  localizeEngagementRoleOptions,
  localizeLeadSourceName,
  localizeLeadSourceOptions,
  localizeLostReasonName,
  localizeLostReasonOptions,
} from './crm-catalog-labels';

export interface CatalogEntryLike {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly kind?: BusinessCatalogKind;
  readonly isSystem?: boolean;
}

export function localizeCatalogEntryName(
  kind: BusinessCatalogKind,
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem = true,
): string {
  switch (kind) {
    case 'client_type':
      return localizeClientTypeName(key, fallbackName, locale, isSystem);
    case 'payment_term':
      return localizePaymentTermName(key, fallbackName, locale);
    case 'vendor_category':
      return localizeVendorCategoryName(key, fallbackName, locale, isSystem);
    case 'lead_source':
      return localizeLeadSourceName(key, fallbackName, locale, isSystem);
    case 'lost_reason':
      return localizeLostReasonName(key, fallbackName, locale, isSystem);
    case 'engagement_role':
      return localizeEngagementRoleName(key, fallbackName, locale, isSystem);
    default:
      return fallbackName;
  }
}

export function localizeCatalogEntryOptions(
  kind: BusinessCatalogKind,
  entries: readonly CatalogEntryLike[],
  locale: string,
): Array<{ id: string; name: string; key?: string }> {
  switch (kind) {
    case 'client_type':
      return localizeClientTypeOptions(entries, locale);
    case 'payment_term':
      return localizePaymentTermOptions(entries, locale);
    case 'vendor_category':
      return localizeVendorCategoryOptions(entries, locale);
    case 'lead_source':
      return localizeLeadSourceOptions(entries, locale);
    case 'lost_reason':
      return localizeLostReasonOptions(entries, locale);
    case 'engagement_role':
      return localizeEngagementRoleOptions(entries, locale);
    default:
      return entries.map((entry) => ({ id: entry.id, name: entry.name, key: entry.key }));
  }
}

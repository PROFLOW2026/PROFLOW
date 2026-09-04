/**
 * Presentation-only mapping for internal codes (DB enums, slugs, keys).
 * Storage stays English; Owner UI must never render the raw token.
 */

import heApprovals from '@/locales/he-IL/approvals.json';
import heAp from '@/locales/he-IL/ap.json';
import heBillingPlan from '@/locales/he-IL/billingPlan.json';
import heCrm from '@/locales/he-IL/crm.json';
import heExpenses from '@/locales/he-IL/expenses.json';
import heFieldOps from '@/locales/he-IL/fieldOps.json';
import heStatus from '@/locales/he-IL/status.json';
import heVendors from '@/locales/he-IL/vendors.json';
import heWorkforce from '@/locales/he-IL/workforce.json';
import heMonthClose from '@/locales/he-IL/monthClose.json';
import enMonthClose from '@/locales/en/monthClose.json';
import enApprovals from '@/locales/en/approvals.json';
import enAp from '@/locales/en/ap.json';
import enBillingPlan from '@/locales/en/billingPlan.json';
import enCrm from '@/locales/en/crm.json';
import enExpenses from '@/locales/en/expenses.json';
import enFieldOps from '@/locales/en/fieldOps.json';
import enStatus from '@/locales/en/status.json';
import enVendors from '@/locales/en/vendors.json';
import enWorkforce from '@/locales/en/workforce.json';

const HEBREW_UNKNOWN = 'לא ידוע';
const ENGLISH_UNKNOWN = 'Unknown';

export function looksLikeInternalCode(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  return /^[a-z][a-z0-9_]*$/.test(trimmed);
}

/** English Title Case / ASCII labels that leaked from system catalog `name` columns. */
export function looksLikeEnglishDisplayName(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  if (looksLikeInternalCode(trimmed)) return true;
  return /^[A-Za-z][A-Za-z0-9 /._&'+-]*$/.test(trimmed) && /[A-Za-z]{3}/.test(trimmed);
}

function flattenStringLeaves(node: unknown, into: Map<string, string>): void {
  if (typeof node === 'string') return;
  if (Array.isArray(node)) {
    for (const item of node) flattenStringLeaves(item, into);
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      into.set(key, value);
    } else {
      flattenStringLeaves(value, into);
    }
  }
}

function buildCatalog(sources: readonly unknown[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const source of sources) flattenStringLeaves(source, map);
  return map;
}

const HE_CATALOG = buildCatalog([
  heStatus,
  heExpenses.costCategories,
  heExpenses.costFamilies,
  heExpenses.recurrence,
  heVendors.types,
  heVendors.engagementStatus,
  heVendors.list?.status,
  heFieldOps.kinds,
  heFieldOps.priorities,
  heApprovals.entityTypes,
  heAp.statuses,
  heBillingPlan.status,
  heBillingPlan.cycleStatus,
  heCrm.statuses,
  heWorkforce.employeeStatus,
  heWorkforce.time?.approvalStatus,
  heMonthClose.checks,
]);

const EN_CATALOG = buildCatalog([
  enStatus,
  enExpenses.costCategories,
  enExpenses.costFamilies,
  enExpenses.recurrence,
  enVendors.types,
  enVendors.engagementStatus,
  enVendors.list?.status,
  enFieldOps.kinds,
  enFieldOps.priorities,
  enApprovals.entityTypes,
  enAp.statuses,
  enBillingPlan.status,
  enBillingPlan.cycleStatus,
  enCrm.statuses,
  enWorkforce.employeeStatus,
  enWorkforce.time?.approvalStatus,
  enMonthClose.checks,
]);

const HE_EXTRAS: Readonly<Record<string, string>> = {
  workforce: 'עובדים',
  month_close: 'סגירת חודש',
  labor: 'עבודה',
  expense: 'הוצאה',
  ap_bill: 'חשבון ספק',
  classified: 'מסווג',
  needs_classification: 'דורש סיווג',
  not_opened: 'לא נפתח',
  'not opened': 'לא נפתח',
  percent: 'אחוז',
  fixed: 'סכום קבוע',
  supplier: 'ספק',
  subcontractor: 'קבלן משנה',
  both: 'ספק וקבלן משנה',
  other: 'אחר',
  proposed_ap: 'חשבון ספק מוצע',
  voided: 'בוטל',
  pending: 'ממתין',
  success: 'הצליח',
  failed: 'נכשל',
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
  critical: 'קריטי',
};

const EN_EXTRAS: Readonly<Record<string, string>> = {
  workforce: 'Employees',
  month_close: 'Month close',
  labor: 'Labor',
  expense: 'Expense',
  ap_bill: 'Vendor bill',
  classified: 'Classified',
  needs_classification: 'Needs classification',
  not_opened: 'Not opened',
  'not opened': 'Not opened',
  percent: 'Percent',
  fixed: 'Fixed amount',
  proposed_ap: 'Proposed vendor bill',
  voided: 'Voided',
  pending: 'Pending',
  success: 'Success',
  failed: 'Failed',
};

function catalogFor(locale: string | null | undefined): Map<string, string> {
  return locale === 'he-IL' || (locale ?? '').startsWith('he') ? HE_CATALOG : EN_CATALOG;
}

function extrasFor(locale: string | null | undefined): Readonly<Record<string, string>> {
  return locale === 'he-IL' || (locale ?? '').startsWith('he') ? HE_EXTRAS : EN_EXTRAS;
}

function unknownFor(locale: string | null | undefined): string {
  return locale === 'he-IL' || (locale ?? '').startsWith('he') ? HEBREW_UNKNOWN : ENGLISH_UNKNOWN;
}

/**
 * Map an internal code / enum / slug to a human label.
 * Never returns a snake_case token when the value looks like an internal code.
 */
export function localizeCode(
  locale: string | null | undefined,
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed === '-') return '-';
  const extras = extrasFor(locale);
  const extra = extras[trimmed] ?? extras[trimmed.toLowerCase()];
  if (extra) return extra;
  const mapped = catalogFor(locale).get(trimmed) ?? catalogFor(locale).get(trimmed.toLowerCase());
  if (mapped) return mapped;
  if (looksLikeInternalCode(trimmed) || looksLikeEnglishDisplayName(trimmed)) {
    return unknownFor(locale);
  }
  return trimmed;
}

export function localizeCodeOrNull(
  locale: string | null | undefined,
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const localized = localizeCode(locale, trimmed);
  if (localized === unknownFor(locale) && looksLikeInternalCode(trimmed)) return null;
  return localized;
}

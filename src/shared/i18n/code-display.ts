/**
 * Presentation-only mapping for internal codes (DB enums, slugs, keys).
 * Storage stays English; Owner UI must never render the raw token.
 */

import arApprovals from '@/locales/ar/approvals.json';
import arAp from '@/locales/ar/ap.json';
import arBillingPlan from '@/locales/ar/billingPlan.json';
import arCrm from '@/locales/ar/crm.json';
import arExpenses from '@/locales/ar/expenses.json';
import arFieldOps from '@/locales/ar/fieldOps.json';
import arMonthClose from '@/locales/ar/monthClose.json';
import arStatus from '@/locales/ar/status.json';
import arVendors from '@/locales/ar/vendors.json';
import arWorkforce from '@/locales/ar/workforce.json';
import enApprovals from '@/locales/en/approvals.json';
import enAp from '@/locales/en/ap.json';
import enBillingPlan from '@/locales/en/billingPlan.json';
import enCrm from '@/locales/en/crm.json';
import enExpenses from '@/locales/en/expenses.json';
import enFieldOps from '@/locales/en/fieldOps.json';
import enMonthClose from '@/locales/en/monthClose.json';
import enStatus from '@/locales/en/status.json';
import enVendors from '@/locales/en/vendors.json';
import enWorkforce from '@/locales/en/workforce.json';
import heApprovals from '@/locales/he-IL/approvals.json';
import heAp from '@/locales/he-IL/ap.json';
import heBillingPlan from '@/locales/he-IL/billingPlan.json';
import heCrm from '@/locales/he-IL/crm.json';
import heExpenses from '@/locales/he-IL/expenses.json';
import heFieldOps from '@/locales/he-IL/fieldOps.json';
import heMonthClose from '@/locales/he-IL/monthClose.json';
import heStatus from '@/locales/he-IL/status.json';
import heVendors from '@/locales/he-IL/vendors.json';
import heWorkforce from '@/locales/he-IL/workforce.json';
import ruApprovals from '@/locales/ru/approvals.json';
import ruAp from '@/locales/ru/ap.json';
import ruBillingPlan from '@/locales/ru/billingPlan.json';
import ruCrm from '@/locales/ru/crm.json';
import ruExpenses from '@/locales/ru/expenses.json';
import ruFieldOps from '@/locales/ru/fieldOps.json';
import ruMonthClose from '@/locales/ru/monthClose.json';
import ruStatus from '@/locales/ru/status.json';
import ruVendors from '@/locales/ru/vendors.json';
import ruWorkforce from '@/locales/ru/workforce.json';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';
import type { Locale } from '@/shared/i18n/config';

const UNKNOWN_BY_LOCALE: Readonly<Record<Locale, string>> = {
  en: 'Unknown',
  'he-IL': 'לא ידוע',
  ar: 'غير معروف',
  ru: 'Неизвестно',
};

type ExpensesCatalog = typeof enExpenses;
type VendorsCatalog = typeof enVendors;
type ApCatalog = typeof enAp;
type WorkforceCatalog = typeof enWorkforce;

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

function catalogSources(
  status: typeof enStatus,
  expenses: ExpensesCatalog,
  vendors: VendorsCatalog,
  fieldOps: typeof enFieldOps,
  approvals: typeof enApprovals,
  ap: ApCatalog,
  billingPlan: typeof enBillingPlan,
  crm: typeof enCrm,
  workforce: WorkforceCatalog,
  monthClose: typeof enMonthClose,
): readonly unknown[] {
  return [
    status,
    expenses.costCategories,
    expenses.costFamilies,
    expenses.recurrence,
    vendors.types,
    vendors.engagementStatus,
    vendors.list?.status,
    fieldOps.kinds,
    fieldOps.priorities,
    approvals.entityTypes,
    ap.statuses,
    billingPlan.status,
    billingPlan.cycleStatus,
    crm.statuses,
    workforce.employeeStatus,
    workforce.time?.approvalStatus,
    monthClose.checks,
  ];
}

const CATALOG_BY_LOCALE: Readonly<Record<Locale, Map<string, string>>> = {
  en: buildCatalog(
    catalogSources(
      enStatus,
      enExpenses,
      enVendors,
      enFieldOps,
      enApprovals,
      enAp,
      enBillingPlan,
      enCrm,
      enWorkforce,
      enMonthClose,
    ),
  ),
  'he-IL': buildCatalog(
    catalogSources(
      heStatus,
      heExpenses,
      heVendors,
      heFieldOps,
      heApprovals,
      heAp,
      heBillingPlan,
      heCrm,
      heWorkforce,
      heMonthClose,
    ),
  ),
  ar: buildCatalog(
    catalogSources(
      arStatus,
      arExpenses,
      arVendors,
      arFieldOps,
      arApprovals,
      arAp,
      arBillingPlan,
      arCrm,
      arWorkforce,
      arMonthClose,
    ),
  ),
  ru: buildCatalog(
    catalogSources(
      ruStatus,
      ruExpenses,
      ruVendors,
      ruFieldOps,
      ruApprovals,
      ruAp,
      ruBillingPlan,
      ruCrm,
      ruWorkforce,
      ruMonthClose,
    ),
  ),
};

const EXTRAS_BY_LOCALE: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {
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
  },
  'he-IL': {
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
    general: 'כללי',
    General: 'כללי',
  },
  ar: {
    workforce: 'موظفون',
    month_close: 'إغلاق شهر',
    labor: 'عمل',
    expense: 'مصروف',
    ap_bill: 'فاتورة مورد',
    classified: 'مصنّف',
    needs_classification: 'يتطلب تصنيف',
    not_opened: 'لم يُفتح',
    'not opened': 'لم يُفتح',
    percent: 'نسبة',
    fixed: 'مبلغ ثابت',
    supplier: 'مورد',
    subcontractor: 'مقاول باطن',
    both: 'مورد ومقاول باطن',
    other: 'أخرى',
    proposed_ap: 'فاتورة مورد مقترحة',
    voided: 'ملغى',
    pending: 'قيد الانتظار',
    success: 'نجح',
    failed: 'فشل',
    high: 'مرتفع',
    medium: 'متوسط',
    low: 'منخفض',
    critical: 'حرج',
    general: 'عام',
    General: 'عام',
  },
  ru: {
    workforce: 'Сотрудники',
    month_close: 'Закрытие месяца',
    labor: 'Работа',
    expense: 'Расход',
    ap_bill: 'Счёт поставщика',
    classified: 'Классифицировано',
    needs_classification: 'Нужна классификация',
    not_opened: 'Не открыто',
    'not opened': 'Не открыто',
    percent: 'Процент',
    fixed: 'Фиксированная сумма',
    supplier: 'Поставщик',
    subcontractor: 'Субподрядчик',
    both: 'Поставщик и субподрядчик',
    other: 'Другое',
    proposed_ap: 'Предложенный счёт поставщика',
    voided: 'Аннулировано',
    pending: 'Ожидание',
    success: 'Успех',
    failed: 'Ошибка',
    high: 'Высокий',
    medium: 'Средний',
    low: 'Низкий',
    critical: 'Критичный',
    general: 'Общий',
    General: 'Общий',
  },
};

function labelLocale(locale: string | null | undefined): Locale {
  return resolveLabelLocale(locale ?? 'en');
}

function catalogFor(locale: string | null | undefined): Map<string, string> {
  return CATALOG_BY_LOCALE[labelLocale(locale)];
}

function extrasFor(locale: string | null | undefined): Readonly<Record<string, string>> {
  return EXTRAS_BY_LOCALE[labelLocale(locale)];
}

function unknownFor(locale: string | null | undefined): string {
  return UNKNOWN_BY_LOCALE[labelLocale(locale)];
}

/**
 * Map an internal code / enum / slug to a human label.
 * Never returns a snake_case token when the value looks like an internal code.
 */
export function localizeProjectDisplayName(
  locale: string | null | undefined,
  name: string | null | undefined,
): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return '-';
  const resolved = labelLocale(locale);
  if (trimmed === 'General') {
    return EXTRAS_BY_LOCALE[resolved].General ?? EXTRAS_BY_LOCALE[resolved].general ?? trimmed;
  }
  if (looksLikeEnglishDisplayName(trimmed) && resolved !== 'en') {
    const mapped =
      EXTRAS_BY_LOCALE[resolved][trimmed] ?? EXTRAS_BY_LOCALE[resolved][trimmed.toLowerCase()];
    if (mapped) return mapped;
  }
  return trimmed;
}

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

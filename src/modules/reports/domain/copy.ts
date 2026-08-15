import type { Locale } from '@/shared/i18n/config';
import { DEFAULT_LOCALE, isLocale, localeDirection } from '@/shared/i18n/config';
import en from '@/locales/en/reports.json';
import heIL from '@/locales/he-IL/reports.json';
import type { ReportKind } from './types';

export type ReportsCopy = typeof en;

const CATALOGS: Readonly<Record<Locale, ReportsCopy>> = {
  en,
  'he-IL': heIL,
};

export function resolveReportLocale(locale: string | null | undefined): Locale {
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getReportsCopy(locale: string | null | undefined): ReportsCopy {
  return CATALOGS[resolveReportLocale(locale)];
}

export function reportTitle(copy: ReportsCopy, kind: ReportKind): string {
  return copy.kinds[kind];
}

export function reportDirection(locale: string | null | undefined): 'rtl' | 'ltr' {
  return localeDirection(resolveReportLocale(locale));
}

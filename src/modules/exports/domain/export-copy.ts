import type { Locale } from '@/shared/i18n/config';
import { isLocale, DEFAULT_LOCALE } from '@/shared/i18n/config';
import en from '@/locales/en/exports.json';
import heIL from '@/locales/he-IL/exports.json';

type ExportCatalog = typeof en;

const CATALOGS: Readonly<Record<Locale, ExportCatalog>> = {
  en,
  'he-IL': heIL,
};

export type ExportCopy = ExportCatalog;

export function resolveExportLocale(locale: string | null | undefined): Locale {
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function getExportCopy(locale: string | null | undefined): ExportCopy {
  return CATALOGS[resolveExportLocale(locale)];
}

export function enumLabel(
  copy: ExportCopy,
  group: keyof ExportCopy['enums'],
  value: string | null | undefined,
): string {
  if (!value) return '';
  const map = copy.enums[group] as Record<string, string>;
  return map[value] ?? value;
}

/** Convert decimal / numeric strings to Excel numbers; leave invalid as null. */
export function toExcelNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Parse YYYY-MM-DD into a UTC calendar Date for Excel date cells. */
export function toExcelDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

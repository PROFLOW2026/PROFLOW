import type { CompatReport } from './types';

export const CAD_PREVIEW_LOCALE_DENYLIST =
  /\bAutoCAD\b|\bautocad\b|\bCodeCAD\b|\bcodecad\b|\bmlightcad\b|\bMlightCAD\b|\bjsdelivr\b/i;

export type CadDwgBannerKey =
  | 'cadXrefMissing'
  | 'cadDwgFontsMissing'
  | 'cadDwgViewportMissing'
  | 'cadDwgUnsupported'
  | 'cadDwgCircularXref'
  | 'cadDwgReadErrors'
  | 'cadDwgPartialGeneric';

export type CadDwgBanner = {
  key: CadDwgBannerKey;
  values?: Record<string, string | number>;
};

/** English fallbacks when a locale catalog is stale or missing a banner key. */
export const CAD_DWG_BANNER_FALLBACKS: Record<CadDwgBannerKey, string> = {
  cadXrefMissing:
    '{count, plural, one {One referenced drawing was not found in this folder} other {# referenced drawings were not found in this folder}}: {names}',
  cadDwgFontsMissing: 'Some fonts are unavailable. Text is shown in a substitute font.',
  cadDwgViewportMissing:
    'Layout viewports are not shown yet. Switch to Model to see the full drawing.',
  cadDwgUnsupported:
    'Some elements (fills, curves, images or tables) are not shown yet.',
  cadDwgCircularXref: 'A circular drawing reference was skipped.',
  cadDwgReadErrors: 'Parts of this file could not be read. The preview may be incomplete.',
  cadDwgPartialGeneric: 'Some drawing details may not be fully displayed.',
};

/** Offline banner strings aligned with locale externalStorage preview keys. */
export const CAD_DWG_BANNER_FALLBACKS_BY_LOCALE: Record<
  string,
  Record<CadDwgBannerKey, string>
> = {
  en: CAD_DWG_BANNER_FALLBACKS,
  'he-IL': {
    cadXrefMissing:
      '{count, plural, one {שרטוט מקושר אחד לא נמצא בתיקייה} other {# שרטוטים מקושרים לא נמצאו בתיקייה}}: {names}',
    cadDwgFontsMissing: 'חלק מהגופנים אינם זמינים. הטקסט מוצג בגופן חלופי.',
    cadDwgViewportMissing:
      'חלונות התצוגה ב-Layout אינם מוצגים עדיין. לצפייה בשרטוט המלא עברו ל-Model.',
    cadDwgUnsupported:
      'חלק מהרכיבים (מילויים, עקומות, תמונות או טבלאות) אינם מוצגים עדיין.',
    cadDwgCircularXref: 'הפניה מעגלית בין שרטוטים מקושרים דולגה.',
    cadDwgReadErrors: 'חלקים מהקובץ לא נקראו. ייתכן שהתצוגה חלקית.',
    cadDwgPartialGeneric: 'ייתכן שחלק מפרטי השרטוט אינם מוצגים במלואם.',
  },
  ar: {
    cadXrefMissing:
      '{count, plural, one {لم يُعثر على رسم مرتبط واحد في هذا المجلد} other {لم يُعثر على # رسومات مرتبطة في هذا المجلد}}: {names}',
    cadDwgFontsMissing: 'بعض الخطوط غير متوفرة. يُعرض النص بخط بديل.',
    cadDwgViewportMissing:
      'نوافذ العرض في Layout لا تُعرض بعد. انتقل إلى Model لرؤية الرسم كاملاً.',
    cadDwgUnsupported:
      'بعض العناصر (التعبئة أو المنحنيات أو الصور أو الجداول) لا تُعرض بعد.',
    cadDwgCircularXref: 'تم تخطي مرجع دائري بين الرسومات المرتبطة.',
    cadDwgReadErrors: 'تعذّرت قراءة أجزاء من الملف. قد تكون المعاينة غير مكتملة.',
    cadDwgPartialGeneric: 'قد لا تظهر بعض تفاصيل الرسم بالكامل.',
  },
  ru: {
    cadXrefMissing:
      '{count, plural, one {# связанный чертёж не найден в этой папке} few {# связанных чертежа не найдены в этой папке} other {# связанных чертежей не найдено в этой папке}}: {names}',
    cadDwgFontsMissing: 'Некоторые шрифты недоступны. Текст показан заменяющим шрифтом.',
    cadDwgViewportMissing:
      'Видовые экраны Layout пока не отображаются. Перейдите в Model, чтобы увидеть весь чертёж.',
    cadDwgUnsupported:
      'Некоторые элементы (заливки, кривые, изображения или таблицы) пока не отображаются.',
    cadDwgCircularXref: 'Циклическая ссылка между связанными чертежами пропущена.',
    cadDwgReadErrors: 'Часть файла не удалось прочитать. Предпросмотр может быть неполным.',
    cadDwgPartialGeneric: 'Некоторые детали чертежа могут отображаться не полностью.',
  },
};

function localeBannerFallback(locale: string | undefined, banner: CadDwgBanner): string {
  const pack =
    CAD_DWG_BANNER_FALLBACKS_BY_LOCALE[locale ?? ''] ?? CAD_DWG_BANNER_FALLBACKS;
  const template = pack[banner.key] ?? CAD_DWG_BANNER_FALLBACKS[banner.key];
  const values = banner.values ?? {};
  if (banner.key === 'cadXrefMissing') {
    const count = Number(values.count ?? 0);
    const names = String(values.names ?? '');
    if (locale === 'he-IL') {
      const head =
        count === 1
          ? 'שרטוט מקושר אחד לא נמצא בתיקייה'
          : `${count} שרטוטים מקושרים לא נמצאו בתיקייה`;
      return names ? `${head}: ${names}` : head;
    }
    if (locale === 'ar') {
      const head =
        count === 1
          ? 'لم يُعثر على رسم مرتبط واحد في هذا المجلد'
          : `لم يُعثر على ${count} رسومات مرتبطة في هذا المجلد`;
      return names ? `${head}: ${names}` : head;
    }
    const head =
      count === 1
        ? 'One referenced drawing was not found in this folder'
        : `${count} referenced drawings were not found in this folder`;
    return names ? `${head}: ${names}` : head;
  }
  return template;
}

const CAD_DWG_BANNER_SHORT_EN: Record<CadDwgBannerKey, string> = {
  cadXrefMissing: 'Linked drawing missing',
  cadDwgFontsMissing: 'Substitute fonts',
  cadDwgViewportMissing: 'Layout viewports',
  cadDwgUnsupported: 'Partial display',
  cadDwgCircularXref: 'Circular link',
  cadDwgReadErrors: 'Partial read',
  cadDwgPartialGeneric: 'Partial display',
};

export const CAD_DWG_BANNER_SHORT_BY_LOCALE: Record<
  string,
  Record<CadDwgBannerKey, string>
> = {
  en: CAD_DWG_BANNER_SHORT_EN,
  'he-IL': {
    cadXrefMissing: 'שרטוט מקושר חסר',
    cadDwgFontsMissing: 'גופנים חלופיים',
    cadDwgViewportMissing: 'Viewports — Model',
    cadDwgUnsupported: 'תצוגה חלקית',
    cadDwgCircularXref: 'קישור מעגלי',
    cadDwgReadErrors: 'קריאה חלקית',
    cadDwgPartialGeneric: 'תצוגה חלקית',
  },
  ar: {
    cadXrefMissing: 'رسم مرتبط مفقود',
    cadDwgFontsMissing: 'خطوط بديلة',
    cadDwgViewportMissing: 'Viewports — Model',
    cadDwgUnsupported: 'عرض جزئي',
    cadDwgCircularXref: 'مرجع دائري',
    cadDwgReadErrors: 'قراءة جزئية',
    cadDwgPartialGeneric: 'عرض جزئي',
  },
  ru: {
    cadXrefMissing: 'Связь DWG',
    cadDwgFontsMissing: 'Замена шрифтов',
    cadDwgViewportMissing: 'Viewports — Model',
    cadDwgUnsupported: 'Частичный вид',
    cadDwgCircularXref: 'Циклич. ссылка',
    cadDwgReadErrors: 'Частичное чтение',
    cadDwgPartialGeneric: 'Частичный вид',
  },
};

export function formatCadDwgBannerShort(banner: CadDwgBanner, locale?: string): string {
  const pack =
    CAD_DWG_BANNER_SHORT_BY_LOCALE[locale ?? ''] ?? CAD_DWG_BANNER_SHORT_EN;
  let label = pack[banner.key] ?? CAD_DWG_BANNER_SHORT_EN[banner.key];
  if (banner.key === 'cadXrefMissing') {
    const count = Number(banner.values?.count ?? 0);
    if (count > 0) label = `${label} (${count})`;
  }
  return label;
}

export function formatCadDwgBannerDetail(banner: CadDwgBanner, locale?: string): string {
  return localeBannerFallback(locale, banner);
}

export type CadPreviewTranslator = ((key: string, values?: Record<string, string | number>) => string) & {
  has?: (key: string) => boolean;
};

/** @deprecated Use formatCadDwgBannerDetail — kept for call sites migrating off next-intl. */
export function formatCadDwgBannerLabel(
  _t: CadPreviewTranslator | undefined,
  banner: CadDwgBanner,
  locale?: string,
): string {
  return formatCadDwgBannerDetail(banner, locale);
}

const UNSUPPORTED_ENTITY_KEYS = ['Spline', 'Table', 'Image'] as const;

function skippedEntries(report: CompatReport): [string, number][] {
  return Object.entries(report.skipped ?? {}).filter(
    ([key]) => !key.startsWith('HEAVY:'),
  );
}

function skippedCount(report: CompatReport): number {
  return skippedEntries(report).reduce((sum, [, n]) => sum + n, 0);
}

function renderedCount(report: CompatReport): number {
  return Object.values(report.rendered ?? {}).reduce((sum, n) => sum + n, 0);
}

function hasCircularXref(report: CompatReport): boolean {
  return skippedEntries(report).some(([key]) => key.startsWith('XREF_CIRCULAR:'));
}

function hasMissingViewport(report: CompatReport, activeSpace: string): boolean {
  const inLayout = activeSpace !== '' && !activeSpace.includes('Model');
  if (!inLayout) return false;
  const renderedVp =
    (report.rendered?.['Viewport(model)'] ?? 0) + (report.rendered?.['Viewport(border)'] ?? 0);
  if (renderedVp > 0) return false;
  return skippedEntries(report).some(([key]) => /^Viewport$/i.test(key));
}

function hasUnsupportedGap(report: CompatReport): boolean {
  const skipped = skippedEntries(report);
  const hasHeavyTypes = skipped.some(([key]) =>
    UNSUPPORTED_ENTITY_KEYS.some((t) => key === t || key.startsWith(`${t}:`)),
  );
  if (hasHeavyTypes) return true;
  const skippedN = skippedCount(report);
  const renderedN = renderedCount(report);
  const total = skippedN + renderedN;
  if (total <= 0) return false;
  return skippedN / total > 0.05;
}

export function unresolvedXrefCount(report: CompatReport): number {
  return Object.keys(report.xrefs ?? {}).length;
}

export function xrefMissingNames(report: CompatReport, max = 3): string {
  return Object.keys(report.xrefs ?? {})
    .slice(0, max)
    .join(', ');
}

export function buildCadDwgBanners(
  report: CompatReport,
  activeSpace: string,
): CadDwgBanner[] {
  const candidates: CadDwgBanner[] = [];

  const xrefN = unresolvedXrefCount(report);
  if (xrefN > 0) {
    candidates.push({
      key: 'cadXrefMissing',
      values: { count: xrefN, names: xrefMissingNames(report) },
    });
  }

  if ((report.missingFonts?.length ?? 0) > 0) {
    candidates.push({ key: 'cadDwgFontsMissing' });
  }

  if (hasMissingViewport(report, activeSpace)) {
    candidates.push({ key: 'cadDwgViewportMissing' });
  }

  if (hasUnsupportedGap(report)) {
    candidates.push({ key: 'cadDwgUnsupported' });
  }

  if (hasCircularXref(report)) {
    candidates.push({ key: 'cadDwgCircularXref' });
  }

  if ((report.parserErrors ?? 0) > 0) {
    candidates.push({ key: 'cadDwgReadErrors' });
  }

  if (candidates.length === 0) {
    return [];
  }

  return candidates.slice(0, 2);
}

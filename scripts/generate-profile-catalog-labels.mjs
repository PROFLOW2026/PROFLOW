/** One-off generator: profile-catalog-labels.ts from profile-catalog-seeds.ts */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/modules/tenancy/domain/profile-catalog-seeds.ts', 'utf8');
const items = new Map();
for (const m of src.matchAll(
  /key: '([^']+)'[\s\S]*?nameEn: '((?:\\'|[^'])*)'[\s\S]*?nameHe: '((?:\\'|[^'])*)'/g,
)) {
  items.set(m[1], { en: m[2].replace(/\\'/g, "'"), he: m[3].replace(/\\'/g, "'") });
}

// AR/RU overlays for profile-seeded catalog keys (system display only).
const AR = {
  building_materials: 'مواد بناء', equipment_rental: 'تأجير معدات', concrete: 'خرسانة', electrical: 'كهرباء',
  plumbing: 'سباكة', hvac: 'تكييف', finishes: 'تشطيبات', architect: 'مهندس معماري', engineer: 'مهندس',
  panels: 'لوحات', lighting: 'إضاءة', piping: 'أنابيب', '01': 'متطلبات عامة', '03': 'خرسانة', '26': 'كهرباء', '22': 'سباكة',
  electrical_materials: 'مواد كهربائية', cable: 'كابلات', switchgear: 'لوحات ومفاتيح', electrical_sub: 'مقاول كهرباء',
  low_voltage: 'جهد منخفض', fire_alarm: 'إنذار حريق', drafting: 'مسودات', structural: 'هندسة إنشائية',
  surveyor: 'مسّاح', print_shop: 'طباعة', DES: 'رسوم تصميم', CONS: 'استشاريون', parts: 'قطع غيار',
  hvac_service: 'خدمة تكييف', materials: 'مواد', lower_tier_sub: 'مقاول باطن من الدرجة الثانية',
  infrastructure: 'بنية تحتية', 'E-MAT': 'مواد كهربائية', 'E-LAB': 'عمل كهربائي', 'E-SUB': 'مقاولات كهربائية',
};
const RU = {
  building_materials: 'Стройматериалы', equipment_rental: 'Аренда оборудования', concrete: 'Бетон', electrical: 'Электрика',
  plumbing: 'Сантехника', hvac: 'HVAC', finishes: 'Отделка', architect: 'Архитектор', engineer: 'Инженер',
  panels: 'Щиты', lighting: 'Освещение', piping: 'Трубопровод', '01': 'Общие требования', '03': 'Бетон', '26': 'Электрика', '22': 'Сантехника',
  electrical_materials: 'Электроматериалы', cable: 'Кабель', switchgear: 'Щиты и автоматы', electrical_sub: 'Субподрядчик по электрике',
  low_voltage: 'Слаботочные системы', fire_alarm: 'Пожарная сигнализация', drafting: 'Черчение', structural: 'Кonstruktivный инженер',
  surveyor: 'Геодезист', print_shop: 'Печать', DES: 'Проектирование', CONS: 'Консультанты', parts: 'Запчасти',
  hvac_service: 'Сервис HVAC', materials: 'Материалы', lower_tier_sub: 'Субподрядчик нижнего уровня',
  infrastructure: 'Инфраструктура', 'E-MAT': 'Электроматериалы', 'E-LAB': 'Электромонтаж', 'E-SUB': 'Субподряд электрики',
};

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const lines = [];
lines.push(`/**
 * Locale labels for profile-seeded vendor_category / vendor_specialty / cost_code keys.
 * Generated from profile-catalog-seeds; DB names stay English/Hebrew at seed time.
 */`);
lines.push(`import type { Locale } from '@/shared/i18n/config';`);
lines.push(`import { resolveLabelLocale } from '@/shared/i18n/intl-locale';`);
lines.push('');
for (const [loc, mapName] of [
  ['en', 'PROFILE_CATALOG_LABELS_EN'],
  ['he-IL', 'PROFILE_CATALOG_LABELS_HE'],
  ['ar', 'PROFILE_CATALOG_LABELS_AR'],
  ['ru', 'PROFILE_CATALOG_LABELS_RU'],
]) {
  lines.push(`export const ${mapName}: Readonly<Record<string, string>> = {`);
  for (const [key, { en, he }] of items) {
    let val = loc === 'en' ? en : loc === 'he-IL' ? he : loc === 'ar' ? (AR[key] ?? en) : (RU[key] ?? en);
    lines.push(`  ${key.match(/^[A-Za-z_]\w*$/) ? key : `'${key}'`}: '${esc(val)}',`);
  }
  lines.push('};');
  lines.push('');
}

lines.push(`const LABELS_BY_LOCALE: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: PROFILE_CATALOG_LABELS_EN,
  'he-IL': PROFILE_CATALOG_LABELS_HE,
  ar: PROFILE_CATALOG_LABELS_AR,
  ru: PROFILE_CATALOG_LABELS_RU,
};`);
lines.push('');
lines.push(`export function localizeProfileCatalogName(
  key: string | null | undefined,
  fallbackName: string,
  locale: string,
  isSystem = true,
): string {
  if (!key || !isSystem) return fallbackName;
  const labels = LABELS_BY_LOCALE[resolveLabelLocale(locale)];
  return labels[key] ?? fallbackName;
}`);
lines.push('');
lines.push(`export function localizeProfileCatalogOptions(
  entries: readonly { id: string; key: string; name: string; isSystem?: boolean }[],
  locale: string,
): Array<{ id: string; name: string; key?: string }> {
  return entries.map((entry) => ({
    id: entry.id,
    key: entry.key,
    name: localizeProfileCatalogName(entry.key, entry.name, locale, entry.isSystem ?? false),
  }));
}`);

writeFileSync('src/modules/business-catalog/domain/profile-catalog-labels.ts', lines.join('\n'));
console.log('Wrote profile-catalog-labels.ts with', items.size, 'keys');

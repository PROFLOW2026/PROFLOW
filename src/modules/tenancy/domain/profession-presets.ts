/**
 * Profession presets (docs 35–36). Preset ≠ restriction: applying creates
 * editable catalog rows. Users may ignore, edit, or start blank.
 */

export const PROFESSION_PRESET_KEYS = [
  'electrician',
  'architect',
  'main_contractor',
  'hvac_subcontractor',
  'safety_consultant',
  'interior_design',
] as const;

export type ProfessionPresetKey = (typeof PROFESSION_PRESET_KEYS)[number];

export interface ProfessionPreset {
  readonly key: ProfessionPresetKey;
  readonly domains: readonly { key: string; nameEn: string; nameHe: string }[];
  readonly workPackageNames: readonly { nameEn: string; nameHe: string }[];
  readonly documentChecklist: readonly { key: string; nameEn: string; nameHe: string }[];
  readonly extraExpenseCategories: readonly {
    key: string;
    nameEn: string;
    nameHe: string;
    family: 'direct_project' | 'shared' | 'business_overhead' | 'asset_capital';
  }[];
}

export const PROFESSION_PRESETS: readonly ProfessionPreset[] = [
  {
    key: 'electrician',
    domains: [{ key: 'electrical', nameEn: 'Electrical', nameHe: 'חשמל' }],
    workPackageNames: [
      { nameEn: 'Rough-in', nameHe: 'הכנות' },
      { nameEn: 'Finish', nameHe: 'סיום' },
    ],
    documentChecklist: [
      { key: 'permit', nameEn: 'Electrical permit', nameHe: 'היתר חשמל' },
      { key: 'as_built', nameEn: 'As-built drawings', nameHe: 'תוכניות As-built' },
    ],
    extraExpenseCategories: [
      { key: 'materials_electrical', nameEn: 'Electrical materials', nameHe: 'חומרי חשמל', family: 'direct_project' },
    ],
  },
  {
    key: 'architect',
    domains: [{ key: 'architecture', nameEn: 'Architecture', nameHe: 'אדריכלות' }],
    workPackageNames: [
      { nameEn: 'Concept', nameHe: 'קונספט' },
      { nameEn: 'Detailed design', nameHe: 'תכנון מפורט' },
    ],
    documentChecklist: [
      { key: 'brief', nameEn: 'Design brief', nameHe: 'בריף תכנון' },
      { key: 'drawings', nameEn: 'Drawing set', nameHe: 'סט תוכניות' },
    ],
    extraExpenseCategories: [
      { key: 'printing', nameEn: 'Printing / plotting', nameHe: 'הדפסות', family: 'direct_project' },
    ],
  },
  {
    key: 'main_contractor',
    domains: [{ key: 'general_contracting', nameEn: 'General contracting', nameHe: 'קבלנות ראשית' }],
    workPackageNames: [
      { nameEn: 'Structure', nameHe: 'שלד' },
      { nameEn: 'Finishes', nameHe: 'גמרים' },
      { nameEn: 'MEP', nameHe: 'מערכות' },
    ],
    documentChecklist: [
      { key: 'contract', nameEn: 'Main contract', nameHe: 'חוזה ראשי' },
      { key: 'insurance', nameEn: 'Insurance certificates', nameHe: 'אישורי ביטוח' },
    ],
    extraExpenseCategories: [
      { key: 'subcontractor', nameEn: 'Subcontractor payments', nameHe: 'תשלומי קבלני משנה', family: 'direct_project' },
    ],
  },
  {
    key: 'hvac_subcontractor',
    domains: [{ key: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג אוויר' }],
    workPackageNames: [
      { nameEn: 'Install', nameHe: 'התקנה' },
      { nameEn: 'Commissioning', nameHe: 'הפעלה' },
    ],
    documentChecklist: [
      { key: 'specs', nameEn: 'Equipment specs', nameHe: 'מפרטי ציוד' },
    ],
    extraExpenseCategories: [
      { key: 'hvac_equipment', nameEn: 'HVAC equipment', nameHe: 'ציוד מיזוג', family: 'direct_project' },
    ],
  },
  {
    key: 'safety_consultant',
    domains: [{ key: 'safety', nameEn: 'Safety consulting', nameHe: 'ייעוץ בטיחות' }],
    workPackageNames: [
      { nameEn: 'Assessment', nameHe: 'סקר' },
      { nameEn: 'Follow-up', nameHe: 'מעקב' },
    ],
    documentChecklist: [
      { key: 'safety_plan', nameEn: 'Safety plan', nameHe: 'תוכנית בטיחות' },
    ],
    extraExpenseCategories: [
      { key: 'travel', nameEn: 'Site travel', nameHe: 'נסיעות לאתר', family: 'direct_project' },
    ],
  },
  {
    key: 'interior_design',
    domains: [{ key: 'interior_design', nameEn: 'Interior design', nameHe: 'עיצוב פנים' }],
    workPackageNames: [
      { nameEn: 'Concept', nameHe: 'קונספט' },
      { nameEn: 'Procurement support', nameHe: 'ליווי רכש' },
    ],
    documentChecklist: [
      { key: 'moodboard', nameEn: 'Mood board', nameHe: 'לוח השראה' },
      { key: 'ff_e', nameEn: 'FF&E schedule', nameHe: 'רשימת ריהוט וציוד' },
    ],
    extraExpenseCategories: [
      { key: 'samples', nameEn: 'Samples', nameHe: 'דגימות', family: 'direct_project' },
    ],
  },
];

export function getProfessionPreset(key: string | null | undefined): ProfessionPreset | null {
  if (!key) return null;
  return PROFESSION_PRESETS.find((preset) => preset.key === key) ?? null;
}

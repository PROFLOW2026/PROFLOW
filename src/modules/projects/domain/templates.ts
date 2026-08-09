/**
 * Project / work-package structure templates (doc 36).
 *
 * Apply semantics: preview → clone → instantiate editable copies.
 * Never live-link templates to projects; changing a template later must not
 * mutate historical project rows.
 */

export const PROJECT_TEMPLATE_KEYS = [
  'simple_finish',
  'residential_mep',
  'design_studio',
  'main_contractor',
] as const;

export type ProjectTemplateKey = (typeof PROJECT_TEMPLATE_KEYS)[number];

export interface TemplateNamedItem {
  readonly nameEn: string;
  readonly nameHe: string;
}

export interface WorkPackageTemplateDraft {
  readonly nameEn: string;
  readonly nameHe: string;
  readonly phases: readonly TemplateNamedItem[];
}

export interface MilestoneTemplateDraft {
  readonly nameEn: string;
  readonly nameHe: string;
  /** Optional offset from project start when applying (calendar days). */
  readonly offsetDaysFromStart: number | null;
}

export interface ProjectTemplate {
  readonly key: ProjectTemplateKey;
  readonly nameEn: string;
  readonly nameHe: string;
  readonly descriptionEn: string;
  readonly descriptionHe: string;
  readonly workPackages: readonly WorkPackageTemplateDraft[];
  readonly milestones: readonly MilestoneTemplateDraft[];
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  {
    key: 'simple_finish',
    nameEn: 'Simple finish job',
    nameHe: 'עבודת גמר פשוטה',
    descriptionEn: 'One general area plus rough-in and finish milestones.',
    descriptionHe: 'תחום כללי אחד עם אבני דרך להכנות וסיום.',
    workPackages: [
      { nameEn: 'Rough-in', nameHe: 'הכנות', phases: [] },
      { nameEn: 'Finish', nameHe: 'סיום', phases: [] },
    ],
    milestones: [
      { nameEn: 'Start on site', nameHe: 'תחילת עבודה באתר', offsetDaysFromStart: 0 },
      { nameEn: 'Ready for inspection', nameHe: 'מוכן לבדיקה', offsetDaysFromStart: 14 },
      { nameEn: 'Handover', nameHe: 'מסירה', offsetDaysFromStart: 30 },
    ],
  },
  {
    key: 'residential_mep',
    nameEn: 'Residential MEP',
    nameHe: 'MEP למגורים',
    descriptionEn: 'Electrical, plumbing, and HVAC work areas.',
    descriptionHe: 'תחומי חשמל, אינסטלציה ומיזוג.',
    workPackages: [
      { nameEn: 'Electrical', nameHe: 'חשמל', phases: [] },
      { nameEn: 'Plumbing', nameHe: 'אינסטלציה', phases: [] },
      { nameEn: 'HVAC', nameHe: 'מיזוג אוויר', phases: [] },
    ],
    milestones: [
      { nameEn: 'Rough complete', nameHe: 'סיום הכנות', offsetDaysFromStart: 21 },
      { nameEn: 'Systems commissioned', nameHe: 'הפעלת מערכות', offsetDaysFromStart: 45 },
    ],
  },
  {
    key: 'design_studio',
    nameEn: 'Design studio',
    nameHe: 'סטודיו תכנון',
    descriptionEn: 'Concept → detailed design with review milestones.',
    descriptionHe: 'קונספט ← תכנון מפורט עם אבני דרך לביקורת.',
    workPackages: [
      {
        nameEn: 'Concept',
        nameHe: 'קונספט',
        phases: [
          { nameEn: 'Brief', nameHe: 'בריף' },
          { nameEn: 'Options', nameHe: 'חלופות' },
        ],
      },
      {
        nameEn: 'Detailed design',
        nameHe: 'תכנון מפורט',
        phases: [{ nameEn: 'Documentation', nameHe: 'תיעוד' }],
      },
    ],
    milestones: [
      { nameEn: 'Concept approved', nameHe: 'אישור קונספט', offsetDaysFromStart: 14 },
      { nameEn: 'Issue for construction', nameHe: 'הנפקה לביצוע', offsetDaysFromStart: 60 },
    ],
  },
  {
    key: 'main_contractor',
    nameEn: 'Main contractor',
    nameHe: 'קבלן ראשי',
    descriptionEn: 'Structure, finishes, and MEP packages.',
    descriptionHe: 'שלד, גמרים ומערכות.',
    workPackages: [
      { nameEn: 'Structure', nameHe: 'שלד', phases: [] },
      { nameEn: 'Finishes', nameHe: 'גמרים', phases: [] },
      { nameEn: 'MEP', nameHe: 'מערכות', phases: [] },
    ],
    milestones: [
      { nameEn: 'Structure complete', nameHe: 'סיום שלד', offsetDaysFromStart: 90 },
      { nameEn: 'Practical completion', nameHe: 'סיום מעשי', offsetDaysFromStart: 180 },
    ],
  },
];

export function getProjectTemplate(key: string | null | undefined): ProjectTemplate | null {
  if (!key) return null;
  return PROJECT_TEMPLATES.find((template) => template.key === key) ?? null;
}

export type TemplateLocale = 'en' | 'he-IL';

function localizeName(item: TemplateNamedItem, locale: TemplateLocale): string {
  return locale === 'he-IL' ? item.nameHe : item.nameEn;
}

/** Read-only preview for UI — never mutates the catalog entry. */
export interface ProjectTemplatePreview {
  readonly key: ProjectTemplateKey;
  readonly name: string;
  readonly description: string;
  readonly workPackageNames: readonly string[];
  readonly phaseCount: number;
  readonly milestoneNames: readonly string[];
}

export function previewProjectTemplate(
  key: ProjectTemplateKey,
  locale: TemplateLocale = 'en',
): ProjectTemplatePreview | null {
  const template = getProjectTemplate(key);
  if (!template) return null;
  return {
    key: template.key,
    name: locale === 'he-IL' ? template.nameHe : template.nameEn,
    description: locale === 'he-IL' ? template.descriptionHe : template.descriptionEn,
    workPackageNames: template.workPackages.map((pkg) => localizeName(pkg, locale)),
    phaseCount: template.workPackages.reduce((sum, pkg) => sum + pkg.phases.length, 0),
    milestoneNames: template.milestones.map((m) => localizeName(m, locale)),
  };
}

/**
 * Deep-cloned apply payload. Callers persist copies; the catalog stays untouched.
 */
export interface ProjectTemplateApplyCopy {
  readonly templateKey: ProjectTemplateKey;
  readonly workPackages: readonly {
    readonly name: string;
    readonly phases: readonly string[];
  }[];
  readonly milestones: readonly {
    readonly name: string;
    readonly offsetDaysFromStart: number | null;
  }[];
}

export function cloneProjectTemplateForApply(
  key: ProjectTemplateKey,
  locale: TemplateLocale = 'en',
): ProjectTemplateApplyCopy | null {
  const template = getProjectTemplate(key);
  if (!template) return null;

  // Explicit map → new objects: no shared references with the catalog.
  return {
    templateKey: template.key,
    workPackages: template.workPackages.map((pkg) => ({
      name: localizeName(pkg, locale),
      phases: pkg.phases.map((phase) => localizeName(phase, locale)),
    })),
    milestones: template.milestones.map((milestone) => ({
      name: localizeName(milestone, locale),
      offsetDaysFromStart: milestone.offsetDaysFromStart,
    })),
  };
}

/** Adds calendar days to a YYYY-MM-DD business date; returns null if base missing. */
export function offsetBusinessDate(
  baseDate: string | null | undefined,
  offsetDays: number | null,
): string | null {
  if (!baseDate || offsetDays == null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) return null;
  const [year, month, day] = baseDate.split('-').map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(year, month - 1, day + offsetDays));
  const y = probe.getUTCFullYear();
  const m = String(probe.getUTCMonth() + 1).padStart(2, '0');
  const d = String(probe.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

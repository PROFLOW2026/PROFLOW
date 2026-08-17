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
  'apartment_renovation',
  'electrical_project',
  'maintenance_contract',
  'architecture_project',
  'consulting_engagement',
  'service_installation',
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

export interface FormChecklistTemplateDraft {
  readonly nameEn: string;
  readonly nameHe: string;
  readonly items: readonly TemplateNamedItem[];
}

export interface ProjectTemplate {
  readonly key: ProjectTemplateKey;
  readonly nameEn: string;
  readonly nameHe: string;
  readonly descriptionEn: string;
  readonly descriptionHe: string;
  readonly workPackages: readonly WorkPackageTemplateDraft[];
  readonly milestones: readonly MilestoneTemplateDraft[];
  /** Suggested org/project document folders - copied on apply, never live-linked. */
  readonly documentFolders: readonly TemplateNamedItem[];
  /** Inspection / checklist names to copy as org form templates when seeded. */
  readonly formChecklists: readonly FormChecklistTemplateDraft[];
  /** Budget category names if a budget copy API is used later. */
  readonly budgetCategories: readonly TemplateNamedItem[];
  /** Closeout keys stored on org template JSON for a later closeout reader. */
  readonly closeoutRequirementKeys: readonly string[];
  /** BOQ section names (skeleton only - not priced). */
  readonly boqSkeleton: readonly TemplateNamedItem[];
  /** Role template keys for default assignments when a team API exists. */
  readonly defaultRoleKeys: readonly string[];
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
    documentFolders: [
      { nameEn: 'Site photos', nameHe: 'תמונות אתר' },
      { nameEn: 'Handover', nameHe: 'מסירה' },
    ],
    formChecklists: [
      {
        nameEn: 'Finish walkthrough',
        nameHe: 'סיור גמר',
        items: [
          { nameEn: 'Surfaces complete', nameHe: 'משטחים הושלמו' },
          { nameEn: 'Open items listed', nameHe: 'פריטים פתוחים תועדו' },
        ],
      },
    ],
    budgetCategories: [
      { nameEn: 'Labor', nameHe: 'עבודה' },
      { nameEn: 'Materials', nameHe: 'חומרים' },
    ],
    closeoutRequirementKeys: ['handover_photos', 'punch_closed'],
    boqSkeleton: [{ nameEn: 'Finishes', nameHe: 'גמרים' }],
    defaultRoleKeys: [],
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
    documentFolders: [
      { nameEn: 'Permits', nameHe: 'היתרים' },
      { nameEn: 'As-built', nameHe: 'כפי שבוצע' },
    ],
    formChecklists: [
      {
        nameEn: 'MEP commissioning',
        nameHe: 'הרצת מערכות',
        items: [
          { nameEn: 'Electrical tested', nameHe: 'חשמל נבדק' },
          { nameEn: 'Plumbing tested', nameHe: 'אינסטלציה נבדקה' },
          { nameEn: 'HVAC commissioned', nameHe: 'מיזוג הורץ' },
        ],
      },
    ],
    budgetCategories: [
      { nameEn: 'Electrical', nameHe: 'חשמל' },
      { nameEn: 'Plumbing', nameHe: 'אינסטלציה' },
      { nameEn: 'HVAC', nameHe: 'מיזוג' },
    ],
    closeoutRequirementKeys: ['electrical_cert', 'as_built', 'commissioning'],
    boqSkeleton: [
      { nameEn: 'Electrical', nameHe: 'חשמל' },
      { nameEn: 'Plumbing', nameHe: 'אינסטלציה' },
      { nameEn: 'HVAC', nameHe: 'מיזוג' },
    ],
    defaultRoleKeys: [],
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
    documentFolders: [
      { nameEn: 'Drawings', nameHe: 'שרטוטים' },
      { nameEn: 'Client presentations', nameHe: 'מצגות ללקוח' },
    ],
    formChecklists: [
      {
        nameEn: 'Design review',
        nameHe: 'סקירת תכנון',
        items: [
          { nameEn: 'Brief confirmed', nameHe: 'הבריף אושר' },
          { nameEn: 'Client review done', nameHe: 'סקירת לקוח בוצעה' },
        ],
      },
    ],
    budgetCategories: [{ nameEn: 'Design fees', nameHe: 'שכר תכנון' }],
    closeoutRequirementKeys: ['issued_for_construction'],
    boqSkeleton: [],
    defaultRoleKeys: [],
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
    documentFolders: [
      { nameEn: 'Contracts', nameHe: 'חוזים' },
      { nameEn: 'Drawings', nameHe: 'שרטוטים' },
      { nameEn: 'Site photos', nameHe: 'תמונות אתר' },
    ],
    formChecklists: [
      {
        nameEn: 'Site inspection',
        nameHe: 'ביקורת אתר',
        items: [
          { nameEn: 'Safety brief', nameHe: 'תדריך בטיחות' },
          { nameEn: 'Progress recorded', nameHe: 'התקדמות תועדה' },
        ],
      },
    ],
    budgetCategories: [
      { nameEn: 'Structure', nameHe: 'שלד' },
      { nameEn: 'Finishes', nameHe: 'גמרים' },
      { nameEn: 'MEP', nameHe: 'מערכות' },
    ],
    closeoutRequirementKeys: ['practical_completion', 'as_built', 'handover_pack'],
    boqSkeleton: [
      { nameEn: 'Structure', nameHe: 'שלד' },
      { nameEn: 'Finishes', nameHe: 'גמרים' },
      { nameEn: 'MEP', nameHe: 'מערכות' },
    ],
    defaultRoleKeys: [],
  },
  {
    key: 'apartment_renovation',
    nameEn: 'Apartment renovation',
    nameHe: 'שיפוץ דירה',
    descriptionEn: 'Demolition, rough-in, and finishes for a single apartment.',
    descriptionHe: 'פירוק, הכנות וגמרים לדירה אחת.',
    workPackages: [
      { nameEn: 'Demolition', nameHe: 'פירוק', phases: [{ nameEn: 'Protection', nameHe: 'הגנות' }] },
      { nameEn: 'Rough-in', nameHe: 'הכנות', phases: [{ nameEn: 'MEP', nameHe: 'מערכות' }] },
      { nameEn: 'Finishes', nameHe: 'גמרים', phases: [{ nameEn: 'Wet rooms', nameHe: 'רטובים' }] },
    ],
    milestones: [
      { nameEn: 'Site start', nameHe: 'תחילת עבודה', offsetDaysFromStart: 0 },
      { nameEn: 'Rough inspection', nameHe: 'בדיקת הכנות', offsetDaysFromStart: 21 },
      { nameEn: 'Handover', nameHe: 'מסירה', offsetDaysFromStart: 45 },
    ],
    documentFolders: [
      { nameEn: 'Before photos', nameHe: 'תמונות לפני' },
      { nameEn: 'Permits', nameHe: 'היתרים' },
      { nameEn: 'Handover', nameHe: 'מסירה' },
    ],
    formChecklists: [
      {
        nameEn: 'Renovation walkthrough',
        nameHe: 'סיור שיפוץ',
        items: [
          { nameEn: 'Wet rooms complete', nameHe: 'רטובים הושלמו' },
          { nameEn: 'Punch listed', nameHe: 'ליקויים תועדו' },
        ],
      },
    ],
    budgetCategories: [
      { nameEn: 'Demolition', nameHe: 'פירוק' },
      { nameEn: 'Finishes', nameHe: 'גמרים' },
      { nameEn: 'Materials', nameHe: 'חומרים' },
    ],
    closeoutRequirementKeys: ['handover_photos', 'warranty_docs', 'keys'],
    boqSkeleton: [
      { nameEn: 'Demolition', nameHe: 'פירוק' },
      { nameEn: 'Finishes', nameHe: 'גמרים' },
    ],
    defaultRoleKeys: [],
  },
  {
    key: 'electrical_project',
    nameEn: 'Electrical project',
    nameHe: 'פרויקט חשמל',
    descriptionEn: 'Rough-in, devices, and testing for an electrical job.',
    descriptionHe: 'הכנות, נקודות ובדיקות לפרויקט חשמל.',
    workPackages: [
      { nameEn: 'Rough-in', nameHe: 'הכנות', phases: [] },
      { nameEn: 'Devices', nameHe: 'נקודות והתקנות', phases: [] },
      { nameEn: 'Testing', nameHe: 'בדיקות', phases: [] },
    ],
    milestones: [
      { nameEn: 'Rough complete', nameHe: 'סיום הכנות', offsetDaysFromStart: 14 },
      { nameEn: 'Tested and certified', nameHe: 'נבדק ואושר', offsetDaysFromStart: 30 },
    ],
    documentFolders: [
      { nameEn: 'Permits', nameHe: 'היתרים' },
      { nameEn: 'As-built', nameHe: 'כפי שבוצע' },
    ],
    formChecklists: [
      {
        nameEn: 'Electrical test',
        nameHe: 'בדיקת חשמל',
        items: [
          { nameEn: 'Circuits labelled', nameHe: 'מעגלים סומנו' },
          { nameEn: 'Certificate issued', nameHe: 'תעודה הונפקה' },
        ],
      },
    ],
    budgetCategories: [
      { nameEn: 'Materials', nameHe: 'חומרים' },
      { nameEn: 'Labor', nameHe: 'עבודה' },
    ],
    closeoutRequirementKeys: ['electrical_cert', 'as_built'],
    boqSkeleton: [{ nameEn: 'Electrical', nameHe: 'חשמל' }],
    defaultRoleKeys: [],
  },
  {
    key: 'maintenance_contract',
    nameEn: 'Maintenance contract',
    nameHe: 'חוזה תחזוקה',
    descriptionEn: 'Preventive and reactive work with a monthly reporting closeout.',
    descriptionHe: 'עבודה מונעת וטיפול בתקלות עם דיווח חודשי.',
    workPackages: [
      { nameEn: 'Preventive', nameHe: 'תחזוקה מונעת', phases: [] },
      { nameEn: 'Reactive', nameHe: 'טיפול בתקלות', phases: [] },
      { nameEn: 'Reporting', nameHe: 'דיווח', phases: [] },
    ],
    milestones: [
      { nameEn: 'Kickoff', nameHe: 'התנעה', offsetDaysFromStart: 0 },
      { nameEn: 'First monthly report', nameHe: 'דוח חודשי ראשון', offsetDaysFromStart: 30 },
    ],
    documentFolders: [
      { nameEn: 'Site photos', nameHe: 'תמונות אתר' },
      { nameEn: 'Service reports', nameHe: 'דוחות שירות' },
    ],
    formChecklists: [
      {
        nameEn: 'Visit checklist',
        nameHe: 'רשימת ביקור',
        items: [
          { nameEn: 'Asset inspected', nameHe: 'הנכס נבדק' },
          { nameEn: 'Work logged', nameHe: 'העבודה תועדה' },
        ],
      },
    ],
    budgetCategories: [
      { nameEn: 'Preventive', nameHe: 'מונעת' },
      { nameEn: 'Call-outs', nameHe: 'קריאות' },
    ],
    closeoutRequirementKeys: ['monthly_report'],
    boqSkeleton: [],
    defaultRoleKeys: [],
  },
  {
    key: 'architecture_project',
    nameEn: 'Architecture project',
    nameHe: 'פרויקט אדריכלות',
    descriptionEn: 'Concept through construction documents for a design engagement.',
    descriptionHe: 'מקונספט ועד מסמכי ביצוע לליווי תכנון.',
    workPackages: [
      {
        nameEn: 'Concept',
        nameHe: 'קונספט',
        phases: [{ nameEn: 'Brief', nameHe: 'בריף' }],
      },
      {
        nameEn: 'Design development',
        nameHe: 'פיתוח תכנון',
        phases: [{ nameEn: 'Client review', nameHe: 'סקירת לקוח' }],
      },
      {
        nameEn: 'Construction documents',
        nameHe: 'מסמכי ביצוע',
        phases: [],
      },
    ],
    milestones: [
      { nameEn: 'Concept approved', nameHe: 'אישור קונספט', offsetDaysFromStart: 21 },
      { nameEn: 'Issue for construction', nameHe: 'הנפקה לביצוע', offsetDaysFromStart: 90 },
    ],
    documentFolders: [
      { nameEn: 'Drawings', nameHe: 'שרטוטים' },
      { nameEn: 'Client presentations', nameHe: 'מצגות ללקוח' },
    ],
    formChecklists: [
      {
        nameEn: 'Design review',
        nameHe: 'סקירת תכנון',
        items: [
          { nameEn: 'Program confirmed', nameHe: 'התוכנית אושרה' },
          { nameEn: 'IFC issued', nameHe: 'הונפק לביצוע' },
        ],
      },
    ],
    budgetCategories: [{ nameEn: 'Design fees', nameHe: 'שכר תכנון' }],
    closeoutRequirementKeys: ['issued_for_construction'],
    boqSkeleton: [],
    defaultRoleKeys: [],
  },
  {
    key: 'consulting_engagement',
    nameEn: 'Consulting engagement',
    nameHe: 'ליווי ייעוץ',
    descriptionEn: 'Kickoff, analysis, and a delivered report.',
    descriptionHe: 'התנעה, ניתוח ומסירת דוח.',
    workPackages: [
      { nameEn: 'Kickoff', nameHe: 'התנעה', phases: [] },
      { nameEn: 'Analysis', nameHe: 'ניתוח', phases: [] },
      { nameEn: 'Delivery', nameHe: 'מסירה', phases: [] },
    ],
    milestones: [
      { nameEn: 'Kickoff meeting', nameHe: 'פגישת התנעה', offsetDaysFromStart: 0 },
      { nameEn: 'Draft report', nameHe: 'טיוטת דוח', offsetDaysFromStart: 21 },
      { nameEn: 'Final delivery', nameHe: 'מסירה סופית', offsetDaysFromStart: 45 },
    ],
    documentFolders: [
      { nameEn: 'Reports', nameHe: 'דוחות' },
      { nameEn: 'Correspondence', nameHe: 'התכתבות' },
    ],
    formChecklists: [
      {
        nameEn: 'Engagement closeout',
        nameHe: 'סגירת ליווי',
        items: [
          { nameEn: 'Findings delivered', nameHe: 'הממצאים נמסרו' },
          { nameEn: 'Client sign-off', nameHe: 'אישור לקוח' },
        ],
      },
    ],
    budgetCategories: [{ nameEn: 'Professional fees', nameHe: 'שכר מקצועי' }],
    closeoutRequirementKeys: ['final_report'],
    boqSkeleton: [],
    defaultRoleKeys: [],
  },
  {
    key: 'service_installation',
    nameEn: 'Service installation',
    nameHe: 'התקנת שירות',
    descriptionEn: 'Survey, install, and commission a service job.',
    descriptionHe: 'סקר, התקנה והרצה לעבודת שירות.',
    workPackages: [
      { nameEn: 'Survey', nameHe: 'סקר', phases: [] },
      { nameEn: 'Install', nameHe: 'התקנה', phases: [] },
      { nameEn: 'Commission', nameHe: 'הרצה', phases: [] },
    ],
    milestones: [
      { nameEn: 'Survey complete', nameHe: 'סקר הושלם', offsetDaysFromStart: 3 },
      { nameEn: 'Commissioned', nameHe: 'הורץ', offsetDaysFromStart: 14 },
    ],
    documentFolders: [
      { nameEn: 'Photos', nameHe: 'תמונות' },
      { nameEn: 'Manuals', nameHe: 'מדריכים' },
    ],
    formChecklists: [
      {
        nameEn: 'Installation checklist',
        nameHe: 'רשימת התקנה',
        items: [
          { nameEn: 'Survey done', nameHe: 'הסקר בוצע' },
          { nameEn: 'Installed', nameHe: 'הותקן' },
          { nameEn: 'Commissioned', nameHe: 'הורץ' },
        ],
      },
    ],
    budgetCategories: [
      { nameEn: 'Equipment', nameHe: 'ציוד' },
      { nameEn: 'Labor', nameHe: 'עבודה' },
    ],
    closeoutRequirementKeys: ['commissioning_sheet', 'manuals'],
    boqSkeleton: [],
    defaultRoleKeys: [],
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

/** Read-only preview for UI - never mutates the catalog entry. */
export interface ProjectTemplatePreview {
  readonly key: ProjectTemplateKey;
  readonly name: string;
  readonly description: string;
  readonly workPackageNames: readonly string[];
  readonly phaseCount: number;
  readonly milestoneNames: readonly string[];
  readonly folderNames: readonly string[];
  readonly closeoutRequirementKeys: readonly string[];
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
    folderNames: template.documentFolders.map((folder) => localizeName(folder, locale)),
    closeoutRequirementKeys: [...template.closeoutRequirementKeys],
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
  readonly documentFolders: readonly string[];
  readonly formChecklists: readonly {
    readonly name: string;
    readonly items: readonly string[];
  }[];
  readonly budgetCategories: readonly string[];
  readonly closeoutRequirementKeys: readonly string[];
  readonly boqSkeleton: readonly string[];
  readonly defaultRoleKeys: readonly string[];
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
    documentFolders: template.documentFolders.map((folder) => localizeName(folder, locale)),
    formChecklists: template.formChecklists.map((checklist) => ({
      name: localizeName(checklist, locale),
      items: checklist.items.map((item) => localizeName(item, locale)),
    })),
    budgetCategories: template.budgetCategories.map((category) => localizeName(category, locale)),
    closeoutRequirementKeys: [...template.closeoutRequirementKeys],
    boqSkeleton: template.boqSkeleton.map((item) => localizeName(item, locale)),
    defaultRoleKeys: [...template.defaultRoleKeys],
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

/**
 * Editable setup suggestions seeded when a business profile is applied.
 * Not a product fork: folders, form templates, and project templates are copies.
 */

import type { BusinessProfileKey } from './business-profiles';

export const TODAY_EMPHASIS_VALUES = ['field', 'today', 'dashboard'] as const;
export type TodayEmphasis = (typeof TODAY_EMPHASIS_VALUES)[number];

export const TODAY_EMPHASIS_SETTING_KEY = 'today_emphasis';

export interface NamedSetupItem {
  readonly nameEn: string;
  readonly nameHe: string;
}

export interface FormTemplateSuggestion {
  readonly nameEn: string;
  readonly nameHe: string;
  readonly category: string;
  readonly items: readonly NamedSetupItem[];
}

export interface BusinessProfileSetupSuggestions {
  readonly documentFolders: readonly NamedSetupItem[];
  readonly formTemplates: readonly FormTemplateSuggestion[];
  readonly projectTemplateKeys: readonly string[];
  readonly todayEmphasis: TodayEmphasis;
}

function folders(...pairs: readonly (readonly [string, string])[]): readonly NamedSetupItem[] {
  return pairs.map(([nameEn, nameHe]) => ({ nameEn, nameHe }));
}

function checklist(
  nameEn: string,
  nameHe: string,
  category: string,
  items: readonly (readonly [string, string])[],
): FormTemplateSuggestion {
  return {
    nameEn,
    nameHe,
    category,
    items: items.map(([nameEnItem, nameHeItem]) => ({ nameEn: nameEnItem, nameHe: nameHeItem })),
  };
}

const SITE_PHOTOS = folders(
  ['Site photos', 'תמונות אתר'],
  ['Permits', 'היתרים'],
  ['Handover', 'מסירה'],
);

const DRAWINGS = folders(
  ['Drawings', 'שרטוטים'],
  ['Client presentations', 'מצגות ללקוח'],
  ['Correspondence', 'התכתבות'],
);

const SERVICE_FOLDERS = folders(
  ['Site photos', 'תמונות אתר'],
  ['Service reports', 'דוחות שירות'],
  ['Manuals', 'מדריכים'],
);

const SITE_CHECKLIST = checklist('Site checklist', 'רשימת אתר', 'inspection', [
  ['Access and safety', 'גישה ובטיחות'],
  ['Work completed', 'עבודה שבוצעה'],
  ['Open items', 'פריטים פתוחים'],
]);

const INSTALL_CHECKLIST = checklist('Installation checklist', 'רשימת התקנה', 'inspection', [
  ['Site survey done', 'סקר אתר בוצע'],
  ['Equipment installed', 'הציוד הותקן'],
  ['Commissioned', 'הופעל והורץ'],
]);

const SAFETY_CHECKLIST = checklist('Safety inspection', 'ביקורת בטיחות', 'safety', [
  ['PPE in use', 'ציוד מגן בשימוש'],
  ['Hazards noted', 'סיכונים תועדו'],
  ['Actions assigned', 'פעולות הוקצו'],
]);

const DESIGN_CHECKLIST = checklist('Design review', 'סקירת תכנון', 'design', [
  ['Brief confirmed', 'הבריף אושר'],
  ['Client review done', 'סקירת לקוח בוצעה'],
  ['Issue for construction', 'הנפקה לביצוע'],
]);

const BY_PROFILE: Record<BusinessProfileKey, BusinessProfileSetupSuggestions> = {
  GENERAL_CONTRACTOR: {
    documentFolders: folders(
      ['Contracts', 'חוזים'],
      ['Drawings', 'שרטוטים'],
      ['Site photos', 'תמונות אתר'],
      ['Handover', 'מסירה'],
    ),
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['main_contractor', 'apartment_renovation'],
    todayEmphasis: 'dashboard',
  },
  RENOVATION: {
    documentFolders: SITE_PHOTOS,
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['apartment_renovation', 'simple_finish'],
    todayEmphasis: 'today',
  },
  ELECTRICAL: {
    documentFolders: folders(
      ['Permits', 'היתרים'],
      ['As-built', 'כפי שבוצע'],
      ['Site photos', 'תמונות אתר'],
    ),
    formTemplates: [INSTALL_CHECKLIST],
    projectTemplateKeys: ['electrical_project', 'residential_mep'],
    todayEmphasis: 'field',
  },
  PLUMBING: {
    documentFolders: SERVICE_FOLDERS,
    formTemplates: [INSTALL_CHECKLIST, SITE_CHECKLIST],
    projectTemplateKeys: ['service_installation', 'residential_mep'],
    todayEmphasis: 'field',
  },
  HVAC: {
    documentFolders: SERVICE_FOLDERS,
    formTemplates: [INSTALL_CHECKLIST],
    projectTemplateKeys: ['service_installation', 'residential_mep'],
    todayEmphasis: 'field',
  },
  MAINTENANCE: {
    documentFolders: SERVICE_FOLDERS,
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['maintenance_contract', 'service_installation'],
    todayEmphasis: 'field',
  },
  FIELD_SERVICE: {
    documentFolders: SERVICE_FOLDERS,
    formTemplates: [SITE_CHECKLIST, INSTALL_CHECKLIST],
    projectTemplateKeys: ['service_installation', 'maintenance_contract'],
    todayEmphasis: 'field',
  },
  FACILITY_MANAGEMENT: {
    documentFolders: SERVICE_FOLDERS,
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['maintenance_contract'],
    todayEmphasis: 'today',
  },
  LANDSCAPING: {
    documentFolders: SITE_PHOTOS,
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['simple_finish', 'apartment_renovation'],
    todayEmphasis: 'field',
  },
  CLEANING: {
    documentFolders: folders(['Site photos', 'תמונות אתר'], ['Service reports', 'דוחות שירות']),
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['maintenance_contract'],
    todayEmphasis: 'field',
  },
  INSTALLATION: {
    documentFolders: SERVICE_FOLDERS,
    formTemplates: [INSTALL_CHECKLIST],
    projectTemplateKeys: ['service_installation', 'electrical_project'],
    todayEmphasis: 'field',
  },
  MIXED_PROJECT_SERVICE: {
    documentFolders: folders(
      ['Projects', 'פרויקטים'],
      ['Service reports', 'דוחות שירות'],
      ['Site photos', 'תמונות אתר'],
    ),
    formTemplates: [SITE_CHECKLIST, INSTALL_CHECKLIST],
    projectTemplateKeys: ['apartment_renovation', 'service_installation', 'maintenance_contract'],
    todayEmphasis: 'today',
  },
  SUBCONTRACTOR: {
    documentFolders: folders(['Site photos', 'תמונות אתר'], ['Submittals', 'הגשות']),
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['simple_finish', 'residential_mep'],
    todayEmphasis: 'field',
  },
  ARCHITECT: {
    documentFolders: DRAWINGS,
    formTemplates: [DESIGN_CHECKLIST],
    projectTemplateKeys: ['architecture_project', 'design_studio'],
    todayEmphasis: 'dashboard',
  },
  DESIGNER: {
    documentFolders: DRAWINGS,
    formTemplates: [DESIGN_CHECKLIST],
    projectTemplateKeys: ['architecture_project', 'design_studio'],
    todayEmphasis: 'today',
  },
  ENGINEERING_CONSULTANT: {
    documentFolders: folders(['Reports', 'דוחות'], ['Correspondence', 'התכתבות'], ['Site visits', 'ביקורי אתר']),
    formTemplates: [DESIGN_CHECKLIST],
    projectTemplateKeys: ['consulting_engagement'],
    todayEmphasis: 'dashboard',
  },
  SAFETY_INSPECTION_CONSULTANT: {
    documentFolders: folders(['Inspection photos', 'תמונות ביקורת'], ['Reports', 'דוחות']),
    formTemplates: [SAFETY_CHECKLIST],
    projectTemplateKeys: ['consulting_engagement', 'service_installation'],
    todayEmphasis: 'field',
  },
  PROJECT_MANAGEMENT: {
    documentFolders: folders(['Contracts', 'חוזים'], ['Reports', 'דוחות'], ['Correspondence', 'התכתבות']),
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['consulting_engagement', 'main_contractor'],
    todayEmphasis: 'today',
  },
  SMALL_WORKS: {
    documentFolders: folders(['Site photos', 'תמונות אתר'], ['Quotes', 'הצעות מחיר'], ['Invoices', 'חשבוניות']),
    formTemplates: [SITE_CHECKLIST],
    projectTemplateKeys: ['simple_finish', 'service_installation'],
    todayEmphasis: 'today',
  },
  ALL_CAPABILITIES: {
    documentFolders: folders(
      ['Contracts', 'חוזים'],
      ['Drawings', 'שרטוטים'],
      ['Site photos', 'תמונות אתר'],
      ['Service reports', 'דוחות שירות'],
      ['Handover', 'מסירה'],
    ),
    formTemplates: [SITE_CHECKLIST, SAFETY_CHECKLIST, DESIGN_CHECKLIST],
    projectTemplateKeys: ['main_contractor', 'service_installation', 'consulting_engagement'],
    todayEmphasis: 'today',
  },
};

export function getBusinessProfileSetup(
  key: BusinessProfileKey,
): BusinessProfileSetupSuggestions {
  return BY_PROFILE[key];
}

export function parseTodayEmphasis(value: unknown): TodayEmphasis | null {
  if (value === 'field' || value === 'today' || value === 'dashboard') return value;
  if (value && typeof value === 'object') {
    const nested = (value as { todayEmphasis?: unknown }).todayEmphasis;
    if (nested === 'field' || nested === 'today' || nested === 'dashboard') return nested;
  }
  return null;
}

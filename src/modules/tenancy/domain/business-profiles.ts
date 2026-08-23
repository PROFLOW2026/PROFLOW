/**
 * Business profiles = configuration presets, not separate products.
 * One codebase / one financial engine. Applying a profile seeds editable
 * settings (work mix, modules, Quick Create order, terminology labels,
 * suggested cost categories). Users can change everything afterward.
 */

import type { OptionalModuleKey } from './types';
import type { WorkMix } from './work-mix';

export const BUSINESS_PROFILE_KEYS = [
  'GENERAL_CONTRACTOR',
  'RENOVATION',
  'ELECTRICAL',
  'PLUMBING',
  'HVAC',
  'MAINTENANCE',
  'FIELD_SERVICE',
  'FACILITY_MANAGEMENT',
  'LANDSCAPING',
  'CLEANING',
  'INSTALLATION',
  'MIXED_PROJECT_SERVICE',
  'SUBCONTRACTOR',
  'ARCHITECT',
  'DESIGNER',
  'ENGINEERING_CONSULTANT',
  'SAFETY_INSPECTION_CONSULTANT',
  'PROJECT_MANAGEMENT',
  /** Lightweight contractor — calm nav, no ERP overload. */
  'SMALL_WORKS',
  /** Full platform visibility for Owner QA / power users. */
  'ALL_CAPABILITIES',
] as const;

export type BusinessProfileKey = (typeof BUSINESS_PROFILE_KEYS)[number];

/** Display labels only - underlying work entity stays projects.work_kind. */
export interface WorkTerminologyLabels {
  readonly project: { readonly en: string; readonly he: string };
  readonly job: { readonly en: string; readonly he: string };
  readonly workOrder: { readonly en: string; readonly he: string };
  readonly serviceCall: { readonly en: string; readonly he: string };
}

export type QuickCreateEmphasisKey =
  | 'project'
  | 'job'
  | 'expense'
  | 'change'
  | 'billingRecord'
  | 'payment'
  | 'client'
  | 'vendor'
  | 'employee'
  | 'timeEntry'
  | 'fieldLog'
  | 'maintenance'
  | 'vendorBill'
  | 'attendance'
  | 'quote'
  | 'service';

export interface BusinessProfileCostCategory {
  readonly key: string;
  readonly nameEn: string;
  readonly nameHe: string;
  readonly family: 'direct_project' | 'shared' | 'business_overhead' | 'asset_capital';
}

export interface BusinessProfile {
  readonly key: BusinessProfileKey;
  readonly workMix: WorkMix;
  /** Modules turned on (enabled=true). Others left untouched / auto. */
  readonly visibleModules: readonly OptionalModuleKey[];
  /** Preferred Quick Create action order (permission/module filtered later). */
  readonly quickCreateEmphasis: readonly QuickCreateEmphasisKey[];
  readonly terminology: WorkTerminologyLabels;
  readonly costCategories: readonly BusinessProfileCostCategory[];
  readonly domains: readonly { key: string; nameEn: string; nameHe: string }[];
  readonly suggestedDefaults: {
    readonly defaultWorkKind: 'project' | 'job' | 'work_order';
    readonly preferServiceSurface: boolean;
    readonly todayEmphasis?: 'field' | 'today' | 'dashboard';
  };
}

const TERM_PROJECT_JOB: WorkTerminologyLabels = {
  project: { en: 'Project', he: 'פרויקט' },
  job: { en: 'Job', he: 'עבודה' },
  workOrder: { en: 'Service call', he: 'קריאת שירות' },
  serviceCall: { en: 'Service call', he: 'קריאת שירות' },
};

const TERM_SERVICE_FORWARD: WorkTerminologyLabels = {
  project: { en: 'Project', he: 'פרויקט' },
  job: { en: 'Job', he: 'עבודה' },
  workOrder: { en: 'Service call', he: 'קריאת שירות' },
  serviceCall: { en: 'Service call', he: 'קריאת שירות' },
};

const TERM_FACILITY: WorkTerminologyLabels = {
  project: { en: 'Project', he: 'פרויקט' },
  // Keep Jobs distinct from Service calls / work orders (same financial entity, different surface).
  job: { en: 'Maintenance job', he: 'עבודת תחזוקה' },
  workOrder: { en: 'Service call', he: 'קריאת שירות' },
  serviceCall: { en: 'Service call', he: 'קריאת שירות' },
};

function cats(
  items: readonly BusinessProfileCostCategory[],
): readonly BusinessProfileCostCategory[] {
  return items;
}

export const BUSINESS_PROFILES: readonly BusinessProfile[] = [
  {
    key: 'GENERAL_CONTRACTOR',
    workMix: 'projects',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'changes',
      'documents',
      'workforce',
      'procurement',
      'budgets',
      'boq',
      'approvals',
      'quotes',
      'month_close',
      'command_center',
    ],
    quickCreateEmphasis: ['project', 'expense', 'change', 'client', 'vendor', 'billingRecord'],
    terminology: TERM_PROJECT_JOB,
    domains: [{ key: 'general_contracting', nameEn: 'General contracting', nameHe: 'קבלנות ראשית' }],
    costCategories: cats([
      { key: 'subcontractor', nameEn: 'Subcontractor payments', nameHe: 'תשלומי קבלני משנה', family: 'direct_project' },
      { key: 'materials_gc', nameEn: 'Site materials', nameHe: 'חומרי אתר', family: 'direct_project' },
      { key: 'equipment_rental_gc', nameEn: 'Equipment rental', nameHe: 'השכרת ציוד', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: false, todayEmphasis: 'dashboard' },
  },
  {
    key: 'RENOVATION',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'changes',
      'documents',
      'workforce',
      'quotes',
      'jobs',
      'materials',
      'boq',
      'command_center',
    ],
    quickCreateEmphasis: ['project', 'job', 'expense', 'quote', 'client', 'change'],
    terminology: {
      project: { en: 'Renovation', he: 'שיפוץ' },
      job: { en: 'Job', he: 'עבודה' },
      workOrder: { en: 'Service call', he: 'קריאת שירות' },
      serviceCall: { en: 'Service call', he: 'קריאת שירות' },
    },
    domains: [{ key: 'renovation', nameEn: 'Renovation', nameHe: 'שיפוצים' }],
    costCategories: cats([
      { key: 'finishes', nameEn: 'Finishes', nameHe: 'גמרים', family: 'direct_project' },
      { key: 'demolition', nameEn: 'Demolition', nameHe: 'פירוק', family: 'direct_project' },
      { key: 'materials_reno', nameEn: 'Renovation materials', nameHe: 'חומרי שיפוץ', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: false, todayEmphasis: 'today' },
  },
  {
    key: 'ELECTRICAL',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'field_ops',
      'quotes',
      'materials',
      'forms',
      'service',
    ],
    quickCreateEmphasis: ['job', 'project', 'expense', 'quote', 'client', 'timeEntry'],
    terminology: TERM_PROJECT_JOB,
    domains: [{ key: 'electrical', nameEn: 'Electrical', nameHe: 'חשמל' }],
    costCategories: cats([
      { key: 'materials_electrical', nameEn: 'Electrical materials', nameHe: 'חומרי חשמל', family: 'direct_project' },
      { key: 'permits_electrical', nameEn: 'Electrical permits', nameHe: 'היתרי חשמל', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: false, todayEmphasis: 'field' },
  },
  {
    key: 'PLUMBING',
    workMix: 'jobs',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'field_ops',
      'service',
      'quotes',
      'forms',
      'materials',
    ],
    quickCreateEmphasis: ['job', 'expense', 'service', 'client', 'timeEntry', 'quote'],
    terminology: TERM_SERVICE_FORWARD,
    domains: [{ key: 'plumbing', nameEn: 'Plumbing', nameHe: 'אינסטלציה' }],
    costCategories: cats([
      { key: 'materials_plumbing', nameEn: 'Plumbing materials', nameHe: 'חומרי אינסטלציה', family: 'direct_project' },
      { key: 'emergency_callout', nameEn: 'Emergency call-out', nameHe: 'קריאה דחופה', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: true, todayEmphasis: 'field' },
  },
  {
    key: 'HVAC',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'service',
      'field_ops',
      'quotes',
      'assets',
      'forms',
      'materials',
    ],
    quickCreateEmphasis: ['job', 'service', 'expense', 'quote', 'client', 'maintenance'],
    terminology: TERM_SERVICE_FORWARD,
    domains: [{ key: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג אוויר' }],
    costCategories: cats([
      { key: 'hvac_equipment', nameEn: 'HVAC equipment', nameHe: 'ציוד מיזוג', family: 'direct_project' },
      { key: 'refrigerant', nameEn: 'Refrigerant / gas', nameHe: 'גז קירור', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: true, todayEmphasis: 'today' },
  },
  {
    key: 'MAINTENANCE',
    workMix: 'jobs',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'service',
      'assets',
      'field_ops',
      'forms',
      'command_center',
    ],
    quickCreateEmphasis: ['job', 'service', 'maintenance', 'expense', 'attendance', 'client'],
    terminology: TERM_FACILITY,
    domains: [{ key: 'maintenance', nameEn: 'Maintenance', nameHe: 'תחזוקה' }],
    costCategories: cats([
      { key: 'spare_parts', nameEn: 'Spare parts', nameHe: 'חלקי חילוף', family: 'direct_project' },
      { key: 'preventive_maint', nameEn: 'Preventive maintenance', nameHe: 'תחזוקה מונעת', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'work_order', preferServiceSurface: true, todayEmphasis: 'field' },
  },
  {
    key: 'FIELD_SERVICE',
    workMix: 'jobs',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'service',
      'field_ops',
      'forms',
      'quotes',
      'command_center',
    ],
    quickCreateEmphasis: ['service', 'job', 'expense', 'client', 'timeEntry', 'attendance'],
    terminology: {
      project: { en: 'Project', he: 'פרויקט' },
      job: { en: 'Service job', he: 'עבודת שירות' },
      workOrder: { en: 'Service call', he: 'קריאת שירות' },
      serviceCall: { en: 'Service call', he: 'קריאת שירות' },
    },
    domains: [{ key: 'field_service', nameEn: 'Field service', nameHe: 'שירות שטח' }],
    costCategories: cats([
      { key: 'travel_field', nameEn: 'Field travel', nameHe: 'נסיעות שטח', family: 'direct_project' },
      { key: 'service_parts', nameEn: 'Service parts', nameHe: 'חלקי שירות', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'work_order', preferServiceSurface: true, todayEmphasis: 'field' },
  },
  {
    key: 'FACILITY_MANAGEMENT',
    workMix: 'jobs',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'service',
      'assets',
      'approvals',
      'forms',
      'month_close',
      'command_center',
    ],
    quickCreateEmphasis: ['service', 'job', 'maintenance', 'expense', 'vendor', 'attendance'],
    terminology: TERM_FACILITY,
    domains: [{ key: 'facility_management', nameEn: 'Facility management', nameHe: 'ניהול מתקנים' }],
    costCategories: cats([
      { key: 'facility_supplies', nameEn: 'Facility supplies', nameHe: 'ציוד מתקנים', family: 'direct_project' },
      { key: 'site_contracts', nameEn: 'Site service contracts', nameHe: 'חוזי שירות לאתר', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'work_order', preferServiceSurface: true, todayEmphasis: 'today' },
  },
  {
    key: 'LANDSCAPING',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'quotes',
      'field_ops',
      'materials',
      'service',
    ],
    quickCreateEmphasis: ['job', 'project', 'expense', 'quote', 'client', 'timeEntry'],
    terminology: TERM_PROJECT_JOB,
    domains: [{ key: 'landscaping', nameEn: 'Landscaping', nameHe: 'גינון ופיתוח נוף' }],
    costCategories: cats([
      { key: 'plants_soil', nameEn: 'Plants and soil', nameHe: 'צמחים ואדמה', family: 'direct_project' },
      { key: 'irrigation', nameEn: 'Irrigation', nameHe: 'השקיה', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: false, todayEmphasis: 'field' },
  },
  {
    key: 'CLEANING',
    workMix: 'jobs',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'service',
      'forms',
      'field_ops',
    ],
    quickCreateEmphasis: ['service', 'job', 'expense', 'client', 'attendance', 'timeEntry'],
    terminology: {
      project: { en: 'Project', he: 'פרויקט' },
      job: { en: 'Cleaning job', he: 'עבודת ניקיון' },
      workOrder: { en: 'Service call', he: 'קריאת שירות' },
      serviceCall: { en: 'Service call', he: 'קריאת שירות' },
    },
    domains: [{ key: 'cleaning', nameEn: 'Cleaning', nameHe: 'ניקיון' }],
    costCategories: cats([
      { key: 'cleaning_supplies', nameEn: 'Cleaning supplies', nameHe: 'חומרי ניקוי', family: 'direct_project' },
      { key: 'consumables', nameEn: 'Consumables', nameHe: 'מתכלים', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'work_order', preferServiceSurface: true, todayEmphasis: 'field' },
  },
  {
    key: 'INSTALLATION',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'quotes',
      'field_ops',
      'materials',
      'forms',
      'service',
    ],
    quickCreateEmphasis: ['job', 'project', 'expense', 'quote', 'client', 'fieldLog'],
    terminology: TERM_PROJECT_JOB,
    domains: [{ key: 'installation', nameEn: 'Installation', nameHe: 'התקנות' }],
    costCategories: cats([
      { key: 'install_materials', nameEn: 'Installation materials', nameHe: 'חומרי התקנה', family: 'direct_project' },
      { key: 'commissioning', nameEn: 'Commissioning', nameHe: 'הפעלה והרצה', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: false, todayEmphasis: 'field' },
  },
  {
    key: 'MIXED_PROJECT_SERVICE',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'jobs',
      'service',
      'quotes',
      'changes',
      'documents',
      'field_ops',
      'budgets',
      'approvals',
      'forms',
      'command_center',
      'month_close',
    ],
    quickCreateEmphasis: ['project', 'job', 'service', 'expense', 'quote', 'client'],
    terminology: TERM_SERVICE_FORWARD,
    domains: [
      { key: 'projects', nameEn: 'Projects', nameHe: 'פרויקטים' },
      { key: 'service', nameEn: 'Service', nameHe: 'שירות' },
    ],
    costCategories: cats([
      { key: 'project_direct', nameEn: 'Project direct', nameHe: 'ישיר לפרויקט', family: 'direct_project' },
      { key: 'service_direct', nameEn: 'Service direct', nameHe: 'ישיר לשירות', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: true, todayEmphasis: 'today' },
  },
  {
    key: 'SUBCONTRACTOR',
    workMix: 'projects',
    visibleModules: [
      'clients',
      'vendors',
      'billing',
      'workforce',
      'field_ops',
      'documents',
    ],
    quickCreateEmphasis: ['project', 'expense', 'vendor', 'vendorBill', 'timeEntry', 'fieldLog'],
    terminology: TERM_PROJECT_JOB,
    domains: [{ key: 'subcontracting', nameEn: 'Subcontracting', nameHe: 'קבלנות משנה' }],
    costCategories: cats([
      { key: 'sub_labor', nameEn: 'Crew labor', nameHe: 'עבודת צוות', family: 'direct_project' },
      { key: 'materials_sub', nameEn: 'Trade materials', nameHe: 'חומרי מקצוע', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: false, todayEmphasis: 'field' },
  },
  {
    key: 'ARCHITECT',
    workMix: 'projects',
    visibleModules: [
      'clients',
      'documents',
      'quotes',
      'changes',
      'billing',
    ],
    quickCreateEmphasis: ['project', 'quote', 'client', 'change', 'expense', 'billingRecord'],
    terminology: {
      project: { en: 'Design project', he: 'פרויקט תכנון' },
      job: { en: 'Job', he: 'עבודה' },
      workOrder: { en: 'Site visit', he: 'ביקור באתר' },
      serviceCall: { en: 'Site visit', he: 'ביקור באתר' },
    },
    domains: [{ key: 'architecture', nameEn: 'Architecture', nameHe: 'אדריכלות' }],
    costCategories: cats([
      { key: 'printing_plotting', nameEn: 'Printing / plotting', nameHe: 'הדפסות', family: 'direct_project' },
      { key: 'consultant_fees_arch', nameEn: 'Consultant fees', nameHe: 'שכר יועצים', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: false, todayEmphasis: 'dashboard' },
  },
  {
    key: 'DESIGNER',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'documents',
      'quotes',
      'changes',
      'billing',
      'jobs',
    ],
    quickCreateEmphasis: ['job', 'project', 'quote', 'client', 'change', 'expense'],
    terminology: {
      project: { en: 'Design project', he: 'פרויקט עיצוב' },
      job: { en: 'Design job', he: 'עבודת עיצוב' },
      workOrder: { en: 'Site visit', he: 'ביקור באתר' },
      serviceCall: { en: 'Site visit', he: 'ביקור באתר' },
    },
    domains: [{ key: 'interior_design', nameEn: 'Interior design', nameHe: 'עיצוב פנים' }],
    costCategories: cats([
      { key: 'samples_ff_e', nameEn: 'Samples / FF&E', nameHe: 'דגימות וריהוט', family: 'direct_project' },
      { key: 'styling', nameEn: 'Styling', nameHe: 'סטיילינג', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: false, todayEmphasis: 'today' },
  },
  {
    key: 'ENGINEERING_CONSULTANT',
    workMix: 'projects',
    visibleModules: [
      'clients',
      'documents',
      'quotes',
      'billing',
    ],
    quickCreateEmphasis: ['project', 'quote', 'client', 'expense', 'billingRecord', 'change'],
    terminology: {
      project: { en: 'Engagement', he: 'ליווי הנדסי' },
      job: { en: 'Job', he: 'עבודה' },
      workOrder: { en: 'Site visit', he: 'ביקור באתר' },
      serviceCall: { en: 'Site visit', he: 'ביקור באתר' },
    },
    domains: [{ key: 'engineering', nameEn: 'Engineering consulting', nameHe: 'ייעוץ הנדסי' }],
    costCategories: cats([
      { key: 'engineering_reports', nameEn: 'Reports and calculations', nameHe: 'דוחות וחישובים', family: 'direct_project' },
      { key: 'site_visits_eng', nameEn: 'Site visits', nameHe: 'ביקורי אתר', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: false, todayEmphasis: 'dashboard' },
  },
  {
    key: 'SAFETY_INSPECTION_CONSULTANT',
    workMix: 'mixed',
    visibleModules: [
      'clients',
      'billing',
      'safety',
      'field_ops',
      'forms',
      'jobs',
      'documents',
    ],
    quickCreateEmphasis: ['job', 'fieldLog', 'expense', 'client', 'quote', 'attendance'],
    terminology: {
      project: { en: 'Project', he: 'פרויקט' },
      job: { en: 'Inspection', he: 'ביקורת' },
      workOrder: { en: 'Site inspection', he: 'ביקורת באתר' },
      serviceCall: { en: 'Site inspection', he: 'ביקורת באתר' },
    },
    domains: [{ key: 'safety', nameEn: 'Safety consulting', nameHe: 'ייעוץ בטיחות' }],
    costCategories: cats([
      { key: 'inspection_travel', nameEn: 'Site travel', nameHe: 'נסיעות לאתר', family: 'direct_project' },
      { key: 'safety_equipment', nameEn: 'Safety equipment', nameHe: 'ציוד בטיחות', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: true, todayEmphasis: 'field' },
  },
  {
    key: 'PROJECT_MANAGEMENT',
    workMix: 'projects',
    visibleModules: [
      'clients',
      'changes',
      'budgets',
      'command_center',
      'documents',
      'billing',
    ],
    quickCreateEmphasis: ['project', 'change', 'client', 'expense', 'billingRecord', 'quote'],
    terminology: TERM_PROJECT_JOB,
    domains: [{ key: 'project_management', nameEn: 'Project management', nameHe: 'ניהול פרויקטים' }],
    costCategories: cats([
      { key: 'pm_fees', nameEn: 'Project management fees', nameHe: 'דמי ניהול פרויקט', family: 'direct_project' },
      { key: 'coordination', nameEn: 'Coordination', nameHe: 'תיאום', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: false, todayEmphasis: 'today' },
  },
  {
    key: 'SMALL_WORKS',
    workMix: 'jobs',
    visibleModules: [
      'clients',
      'quotes',
      'jobs',
      'billing',
      'workforce',
      'documents',
      'command_center',
    ],
    quickCreateEmphasis: ['job', 'quote', 'client', 'expense', 'billingRecord', 'payment'],
    terminology: {
      project: { en: 'Project', he: 'פרויקט' },
      job: { en: 'Job', he: 'עבודה' },
      workOrder: { en: 'Service call', he: 'קריאת שירות' },
      serviceCall: { en: 'Service call', he: 'קריאת שירות' },
    },
    domains: [{ key: 'small_works', nameEn: 'Small works', nameHe: 'עבודות קטנות' }],
    costCategories: cats([
      { key: 'materials_small', nameEn: 'Job materials', nameHe: 'חומרים לעבודה', family: 'direct_project' },
      { key: 'small_labor', nameEn: 'Labor', nameHe: 'עבודה', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'job', preferServiceSurface: false, todayEmphasis: 'today' },
  },
  {
    key: 'ALL_CAPABILITIES',
    workMix: 'mixed',
    visibleModules: [
      'billing',
      'workforce',
      'vendors',
      'clients',
      'documents',
      'changes',
      'overhead',
      'crm',
      'compliance',
      'api',
      'procurement',
      'materials',
      'field_ops',
      'assets',
      'jobs',
      'quotes',
      'service',
      'approvals',
      'month_close',
      'budgets',
      'boq',
      'forms',
      'command_center',
      'safety',
    ],
    quickCreateEmphasis: [
      'project',
      'job',
      'service',
      'quote',
      'client',
      'expense',
      'vendor',
      'billingRecord',
      'employee',
      'timeEntry',
      'fieldLog',
    ],
    terminology: TERM_SERVICE_FORWARD,
    domains: [
      { key: 'projects', nameEn: 'Projects', nameHe: 'פרויקטים' },
      { key: 'service', nameEn: 'Service', nameHe: 'שירות' },
      { key: 'jobs', nameEn: 'Jobs', nameHe: 'עבודות' },
    ],
    costCategories: cats([
      { key: 'project_direct', nameEn: 'Project direct', nameHe: 'ישיר לפרויקט', family: 'direct_project' },
      { key: 'service_direct', nameEn: 'Service direct', nameHe: 'ישיר לשירות', family: 'direct_project' },
    ]),
    suggestedDefaults: { defaultWorkKind: 'project', preferServiceSurface: true, todayEmphasis: 'today' },
  },
];

export const BUSINESS_PROFILE_SETTING_KEY = 'business_profile';
export const TERMINOLOGY_SETTING_KEY = 'work_terminology';
export const QUICK_CREATE_EMPHASIS_SETTING_KEY = 'quick_create_emphasis';
export const SUGGESTED_DEFAULTS_SETTING_KEY = 'business_profile_defaults';

export function isBusinessProfileKey(value: string): value is BusinessProfileKey {
  return (BUSINESS_PROFILE_KEYS as readonly string[]).includes(value);
}

export function getBusinessProfile(key: string | null | undefined): BusinessProfile | null {
  if (!key) return null;
  return BUSINESS_PROFILES.find((profile) => profile.key === key) ?? null;
}

/**
 * Map legacy profession preset keys (docs 35–36) onto business profiles so
 * older onboarding payloads keep working.
 */
export const LEGACY_PROFESSION_TO_BUSINESS_PROFILE: Readonly<Record<string, BusinessProfileKey>> = {
  electrician: 'ELECTRICAL',
  architect: 'ARCHITECT',
  main_contractor: 'GENERAL_CONTRACTOR',
  hvac_subcontractor: 'HVAC',
  safety_consultant: 'SAFETY_INSPECTION_CONSULTANT',
  interior_design: 'DESIGNER',
};

export function resolveBusinessProfileKey(raw: string | null | undefined): BusinessProfileKey | null {
  if (!raw || raw === 'none') return null;
  if (isBusinessProfileKey(raw)) return raw;
  return LEGACY_PROFESSION_TO_BUSINESS_PROFILE[raw] ?? null;
}

export function parseTerminology(
  value: unknown,
): WorkTerminologyLabels | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const read = (key: string): { en: string; he: string } | null => {
    const item = v[key];
    if (!item || typeof item !== 'object') return null;
    const en = (item as { en?: unknown }).en;
    const he = (item as { he?: unknown }).he;
    if (typeof en !== 'string' || typeof he !== 'string') return null;
    return { en, he };
  };
  const project = read('project');
  const job = read('job');
  const workOrder = read('workOrder');
  const serviceCall = read('serviceCall');
  if (!project || !job || !workOrder || !serviceCall) return null;
  return { project, job, workOrder, serviceCall };
}

export interface SuggestedBusinessDefaults {
  readonly defaultWorkKind: 'project' | 'job' | 'work_order';
  readonly preferServiceSurface: boolean;
  readonly todayEmphasis?: 'field' | 'today' | 'dashboard';
}

export function parseSuggestedDefaults(value: unknown): SuggestedBusinessDefaults | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const kind = v.defaultWorkKind;
  if (kind !== 'project' && kind !== 'job' && kind !== 'work_order') return null;
  const emphasis = v.todayEmphasis;
  const todayEmphasis =
    emphasis === 'field' || emphasis === 'today' || emphasis === 'dashboard'
      ? emphasis
      : undefined;
  return {
    defaultWorkKind: kind,
    preferServiceSurface: Boolean(v.preferServiceSurface),
    ...(todayEmphasis ? { todayEmphasis } : {}),
  };
}

export function parseQuickCreateEmphasis(value: unknown): readonly QuickCreateEmphasisKey[] | null {
  if (!Array.isArray(value)) return null;
  const allowed = new Set<string>([
    'project',
    'job',
    'expense',
    'change',
    'billingRecord',
    'payment',
    'client',
    'vendor',
    'employee',
    'timeEntry',
    'fieldLog',
    'maintenance',
    'vendorBill',
    'attendance',
    'quote',
    'service',
  ]);
  const out: QuickCreateEmphasisKey[] = [];
  for (const item of value) {
    if (typeof item === 'string' && allowed.has(item)) {
      out.push(item as QuickCreateEmphasisKey);
    }
  }
  return out.length ? out : null;
}

/** Locale-aware label for a terminology slot. */
export function terminologyLabel(
  labels: WorkTerminologyLabels | null | undefined,
  slot: keyof WorkTerminologyLabels,
  locale: string,
): string | null {
  if (!labels) return null;
  return locale === 'he-IL' ? labels[slot].he : labels[slot].en;
}

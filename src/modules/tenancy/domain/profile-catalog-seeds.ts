/**
 * Profile-specific vendor category / specialty / cost-code seeds.
 * Keys are stable; names localized at apply time.
 */

export interface ProfileCatalogSeedItem {
  readonly key: string;
  readonly nameEn: string;
  readonly nameHe: string;
  readonly parentKey?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ProfileCatalogSeeds {
  readonly vendorCategories: readonly ProfileCatalogSeedItem[];
  readonly vendorSpecialties: readonly ProfileCatalogSeedItem[];
  readonly costCodes: readonly ProfileCatalogSeedItem[];
  readonly documentRequirements?: readonly {
    readonly contextKind: 'vendor_type' | 'subcontract' | 'vendor_category';
    readonly contextKey?: string;
    readonly documentTypeKey: string;
    readonly labelEn: string;
    readonly labelHe: string;
  }[];
}

const GC_SEEDS: ProfileCatalogSeeds = {
  vendorCategories: [
    { key: 'building_materials', nameEn: 'Building materials', nameHe: 'חומרי בניין', metadata: { affinity: ['supplier', 'both'] } },
    { key: 'equipment_rental', nameEn: 'Equipment rental', nameHe: 'השכרת ציוד', metadata: { affinity: ['supplier', 'both'] } },
    { key: 'concrete', nameEn: 'Concrete', nameHe: 'בטון', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'electrical', nameEn: 'Electrical', nameHe: 'חשמל', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'plumbing', nameEn: 'Plumbing', nameHe: 'אינסטלציה', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'finishes', nameEn: 'Finishes', nameHe: 'גמרים', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'architect', nameEn: 'Architect', nameHe: 'אדריכל', metadata: { affinity: ['other', 'both'] } },
    { key: 'engineer', nameEn: 'Engineer', nameHe: 'מהנדס', metadata: { affinity: ['other', 'both'] } },
  ],
  vendorSpecialties: [
    { key: 'panels', nameEn: 'Panels', nameHe: 'לוחות', parentKey: 'electrical' },
    { key: 'lighting', nameEn: 'Lighting', nameHe: 'תאורה', parentKey: 'electrical' },
    { key: 'piping', nameEn: 'Piping', nameHe: 'צנרת', parentKey: 'plumbing' },
  ],
  costCodes: [
    { key: '01', nameEn: 'General requirements', nameHe: 'דרישות כלליות' },
    { key: '03', nameEn: 'Concrete', nameHe: 'בטון' },
    { key: '26', nameEn: 'Electrical', nameHe: 'חשמל' },
    { key: '22', nameEn: 'Plumbing', nameHe: 'אינסטלציה' },
  ],
  documentRequirements: [
    { contextKind: 'vendor_type', contextKey: 'subcontractor', documentTypeKey: 'insurance', labelEn: 'Insurance', labelHe: 'ביטוח' },
    { contextKind: 'vendor_type', contextKey: 'subcontractor', documentTypeKey: 'license', labelEn: 'License', labelHe: 'רישיון' },
    { contextKind: 'subcontract', documentTypeKey: 'contract', labelEn: 'Signed contract', labelHe: 'חוזה חתום' },
  ],
};

const ELECTRICAL_SEEDS: ProfileCatalogSeeds = {
  vendorCategories: [
    { key: 'electrical_materials', nameEn: 'Electrical materials', nameHe: 'חומרי חשמל', metadata: { affinity: ['supplier', 'both'] } },
    { key: 'cable', nameEn: 'Cable & wire', nameHe: 'כבלים', metadata: { affinity: ['supplier', 'both'] } },
    { key: 'switchgear', nameEn: 'Switchgear', nameHe: 'לוחות ומפסקים', metadata: { affinity: ['supplier', 'both'] } },
    { key: 'electrical_sub', nameEn: 'Electrical subcontractor', nameHe: 'קבלן חשמל', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'low_voltage', nameEn: 'Low voltage', nameHe: 'מתח נמוך', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'fire_alarm', nameEn: 'Fire alarm', nameHe: 'גילוי אש', metadata: { affinity: ['subcontractor', 'both'] } },
  ],
  vendorSpecialties: [
    { key: 'lighting', nameEn: 'Lighting', nameHe: 'תאורה', parentKey: 'electrical_sub' },
    { key: 'panels', nameEn: 'Panels', nameHe: 'לוחות', parentKey: 'electrical_sub' },
    { key: 'infrastructure', nameEn: 'Infrastructure', nameHe: 'תשתית', parentKey: 'electrical_sub' },
  ],
  costCodes: [
    { key: 'E-MAT', nameEn: 'Electrical materials', nameHe: 'חומרי חשמל' },
    { key: 'E-LAB', nameEn: 'Electrical labor', nameHe: 'עבודת חשמל' },
    { key: 'E-SUB', nameEn: 'Electrical subcontract', nameHe: 'קבלנות חשמל' },
  ],
  documentRequirements: [
    { contextKind: 'vendor_type', contextKey: 'subcontractor', documentTypeKey: 'license', labelEn: 'Electrician license', labelHe: 'רישיון חשמלאי' },
    { contextKind: 'vendor_type', contextKey: 'subcontractor', documentTypeKey: 'insurance', labelEn: 'Insurance', labelHe: 'ביטוח' },
  ],
};

const ARCHITECT_SEEDS: ProfileCatalogSeeds = {
  vendorCategories: [
    { key: 'drafting', nameEn: 'Drafting', nameHe: 'שרטוט', metadata: { affinity: ['other', 'both'] } },
    { key: 'structural', nameEn: 'Structural engineer', nameHe: 'מהנדס קונסטרוקציה', metadata: { affinity: ['other', 'both'] } },
    { key: 'surveyor', nameEn: 'Surveyor', nameHe: 'מודד', metadata: { affinity: ['other', 'both'] } },
    { key: 'print_shop', nameEn: 'Print / plot', nameHe: 'הדפסות', metadata: { affinity: ['supplier', 'both'] } },
  ],
  vendorSpecialties: [],
  costCodes: [
    { key: 'DES', nameEn: 'Design fees', nameHe: 'שכר תכנון' },
    { key: 'CONS', nameEn: 'Consultants', nameHe: 'יועצים' },
  ],
  documentRequirements: [],
};

const MAINTENANCE_SEEDS: ProfileCatalogSeeds = {
  vendorCategories: [
    { key: 'parts', nameEn: 'Spare parts', nameHe: 'חלקי חילוף', metadata: { affinity: ['supplier', 'both'] } },
    { key: 'hvac_service', nameEn: 'HVAC service', nameHe: 'שירות מיזוג', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'elevator', nameEn: 'Elevator service', nameHe: 'מעליות', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'cleaning', nameEn: 'Cleaning', nameHe: 'ניקיון', metadata: { affinity: ['subcontractor', 'both'] } },
  ],
  vendorSpecialties: [],
  costCodes: [
    { key: 'PM', nameEn: 'Preventive maintenance', nameHe: 'תחזוקה מונעת' },
    { key: 'CM', nameEn: 'Corrective maintenance', nameHe: 'תיקון' },
  ],
  documentRequirements: [
    { contextKind: 'vendor_type', contextKey: 'subcontractor', documentTypeKey: 'insurance', labelEn: 'Insurance', labelHe: 'ביטוח' },
  ],
};

const DEFAULT_SEEDS: ProfileCatalogSeeds = {
  vendorCategories: [
    { key: 'general_supplier', nameEn: 'General supplier', nameHe: 'ספק כללי', metadata: { affinity: ['supplier', 'both'] } },
    { key: 'general_sub', nameEn: 'General subcontractor', nameHe: 'קבלן משנה כללי', metadata: { affinity: ['subcontractor', 'both'] } },
    { key: 'consultant', nameEn: 'Consultant', nameHe: 'יועץ', metadata: { affinity: ['other', 'both'] } },
    { key: 'service_provider', nameEn: 'Service provider', nameHe: 'נותן שירות', metadata: { affinity: ['supplier', 'both', 'other'] } },
  ],
  vendorSpecialties: [],
  costCodes: [],
  documentRequirements: [
    { contextKind: 'vendor_type', contextKey: 'subcontractor', documentTypeKey: 'insurance', labelEn: 'Insurance', labelHe: 'ביטוח' },
    { contextKind: 'subcontract', documentTypeKey: 'contract', labelEn: 'Contract', labelHe: 'חוזה' },
  ],
};

const BY_PROFILE: Partial<Record<string, ProfileCatalogSeeds>> = {
  GENERAL_CONTRACTOR: GC_SEEDS,
  RENOVATION: GC_SEEDS,
  ELECTRICAL: ELECTRICAL_SEEDS,
  PLUMBING: {
    ...DEFAULT_SEEDS,
    vendorCategories: [
      { key: 'plumbing_materials', nameEn: 'Plumbing materials', nameHe: 'חומרי אינסטלציה', metadata: { affinity: ['supplier', 'both'] } },
      { key: 'plumbing_sub', nameEn: 'Plumbing subcontractor', nameHe: 'קבלן אינסטלציה', metadata: { affinity: ['subcontractor', 'both'] } },
    ],
  },
  HVAC: {
    ...DEFAULT_SEEDS,
    vendorCategories: [
      { key: 'hvac_materials', nameEn: 'HVAC materials', nameHe: 'חומרי מיזוג', metadata: { affinity: ['supplier', 'both'] } },
      { key: 'hvac_sub', nameEn: 'HVAC subcontractor', nameHe: 'קבלן מיזוג', metadata: { affinity: ['subcontractor', 'both'] } },
    ],
  },
  MAINTENANCE: MAINTENANCE_SEEDS,
  FIELD_SERVICE: MAINTENANCE_SEEDS,
  FACILITY_MANAGEMENT: MAINTENANCE_SEEDS,
  ARCHITECT: ARCHITECT_SEEDS,
  DESIGNER: ARCHITECT_SEEDS,
  ENGINEERING_CONSULTANT: ARCHITECT_SEEDS,
  SAFETY_INSPECTION_CONSULTANT: {
    ...DEFAULT_SEEDS,
    vendorCategories: [
      { key: 'lab_testing', nameEn: 'Lab / testing', nameHe: 'מעבדה / בדיקות', metadata: { affinity: ['other', 'both'] } },
      { key: 'safety_equipment', nameEn: 'Safety equipment', nameHe: 'ציוד בטיחות', metadata: { affinity: ['supplier', 'both'] } },
    ],
  },
  SUBCONTRACTOR: {
    ...DEFAULT_SEEDS,
    vendorCategories: [
      { key: 'materials', nameEn: 'Materials', nameHe: 'חומרים', metadata: { affinity: ['supplier', 'both'] } },
      { key: 'lower_tier_sub', nameEn: 'Lower-tier subcontractor', nameHe: 'קבלן משנה משני', metadata: { affinity: ['subcontractor', 'both'] } },
    ],
  },
  ALL_CAPABILITIES: GC_SEEDS,
};

export function getProfileCatalogSeeds(profileKey: string): ProfileCatalogSeeds {
  return BY_PROFILE[profileKey] ?? DEFAULT_SEEDS;
}

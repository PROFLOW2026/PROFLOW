import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';

export type DemoArchetypeId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';

export type DemoExpenseDensity = 'low' | 'medium' | 'high';

/** A = 7 project + job service; B = 7 project + work_order service; C = small-works heavy jobs */
export type DemoServiceVsProjectMix = 'A' | 'B' | 'C';

export interface DemoCycleParams {
  readonly archetypeId: DemoArchetypeId;
  readonly workforceSize: number;
  readonly expenseDensity: DemoExpenseDensity;
  readonly arLagDays: number;
  readonly subcontractIntensity: 0 | 1 | 2 | 3;
  readonly boqEnabled: boolean;
  readonly serviceVsProjectMix: DemoServiceVsProjectMix;
  /**
   * Month index from January (0 = Jan). null = no intentional quiet month.
   * When anchor is November, last six calendar months are Jun–Nov — quiet must fall outside that window.
   * Only T5 uses January (0) today; acceptance tests assert quiet months stay outside last-6.
   */
  readonly quietMonthOffsetFromJan: number | null;
  /** Typical monthly invoice net before moneyScale from blueprint */
  readonly billingNetBase: number;
  readonly expenseNetBase: number;
  readonly payrollHoursPerMonth: number;
}

export const DEMO_ARCHETYPE_PARAMS: Record<DemoArchetypeId, DemoCycleParams> = {
  T1: {
    archetypeId: 'T1',
    workforceSize: 10,
    expenseDensity: 'high',
    arLagDays: 35,
    subcontractIntensity: 3,
    boqEnabled: true,
    serviceVsProjectMix: 'A',
    quietMonthOffsetFromJan: null,
    billingNetBase: 180_000,
    expenseNetBase: 48_000,
    payrollHoursPerMonth: 1_600,
  },
  T2: {
    archetypeId: 'T2',
    workforceSize: 7,
    expenseDensity: 'high', // medium-high trades
    arLagDays: 25,
    subcontractIntensity: 2,
    boqEnabled: true,
    serviceVsProjectMix: 'B',
    quietMonthOffsetFromJan: null,
    billingNetBase: 90_000,
    expenseNetBase: 24_000,
    payrollHoursPerMonth: 1_085,
  },
  T3: {
    archetypeId: 'T3',
    workforceSize: 5,
    expenseDensity: 'medium',
    arLagDays: 10,
    subcontractIntensity: 1,
    boqEnabled: false,
    serviceVsProjectMix: 'B',
    quietMonthOffsetFromJan: null,
    billingNetBase: 35_000,
    expenseNetBase: 12_000,
    payrollHoursPerMonth: 750,
  },
  T4: {
    archetypeId: 'T4',
    workforceSize: 8,
    expenseDensity: 'medium',
    arLagDays: 20,
    subcontractIntensity: 2,
    boqEnabled: false,
    serviceVsProjectMix: 'A',
    quietMonthOffsetFromJan: null,
    billingNetBase: 55_000,
    expenseNetBase: 15_500,
    payrollHoursPerMonth: 1_160,
  },
  T5: {
    archetypeId: 'T5',
    workforceSize: 4,
    expenseDensity: 'low',
    arLagDays: 50,
    subcontractIntensity: 0,
    boqEnabled: false,
    serviceVsProjectMix: 'A',
    quietMonthOffsetFromJan: 0,
    billingNetBase: 40_000,
    expenseNetBase: 5_500,
    payrollHoursPerMonth: 560,
  },
  T6: {
    archetypeId: 'T6',
    workforceSize: 4,
    expenseDensity: 'medium',
    arLagDays: 7,
    subcontractIntensity: 0,
    boqEnabled: false,
    serviceVsProjectMix: 'C',
    quietMonthOffsetFromJan: null,
    billingNetBase: 22_000,
    expenseNetBase: 8_000,
    payrollHoursPerMonth: 540,
  },
};

export const PROFILE_ARCHETYPE: Record<OnboardingBusinessType, DemoArchetypeId> = {
  GENERAL_CONTRACTOR: 'T1',
  REAL_ESTATE_DEVELOPMENT: 'T1',
  SUBCONTRACTOR: 'T1',
  ELECTRICAL: 'T2',
  PLUMBING: 'T2',
  HVAC: 'T2',
  INSTALLATION: 'T2',
  FIELD_SERVICE: 'T3',
  MAINTENANCE: 'T3',
  CLEANING: 'T3',
  MIXED_PROJECT_SERVICE: 'T3',
  FACILITY_MANAGEMENT: 'T4',
  LANDSCAPING: 'T4',
  ARCHITECT: 'T5',
  DESIGNER: 'T5',
  ENGINEERING_CONSULTANT: 'T5',
  SAFETY_INSPECTION_CONSULTANT: 'T5',
  PROJECT_MANAGEMENT: 'T5',
  SMALL_WORKS: 'T6',
  RENOVATION: 'T6',
};

export function getCycleParams(profileKey: OnboardingBusinessType): DemoCycleParams {
  const archetypeId = PROFILE_ARCHETYPE[profileKey];
  return DEMO_ARCHETYPE_PARAMS[archetypeId];
}
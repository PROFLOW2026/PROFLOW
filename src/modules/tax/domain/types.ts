import type { BusinessDate } from '@/shared/dates';

/** Whether the rule comes from the country pack or is organization-specific. */
export type TaxRuleScope = 'country_pack' | 'organization';

export interface TaxRuleRecord {
  readonly id: string;
  readonly organizationId: string | null;
  readonly countryCode: string;
  readonly key: string;
  readonly name: string;
  readonly method: 'percentage' | 'exempt' | 'zero_rated';
  readonly ratePercent: string | null;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate | null;
  readonly isDefault: boolean;
}

export interface ResolvedTaxRate {
  readonly ruleId: string;
  readonly key: string;
  readonly name: string;
  readonly method: TaxRuleRecord['method'];
  readonly ratePercent: string | null;
  readonly scope: TaxRuleScope;
  readonly validFrom: BusinessDate;
  readonly validTo: BusinessDate | null;
}

export interface TaxResolutionExplanation {
  readonly date: BusinessDate;
  readonly resolved: ResolvedTaxRate | null;
  readonly consideredRuleCount: number;
  readonly usedOrgOverride: boolean;
}

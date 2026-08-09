import { isEffectiveOn, selectEffective, type BusinessDate } from '@/shared/dates';
import type { ResolvedTaxRate, TaxResolutionExplanation, TaxRuleRecord } from './types';

/**
 * Resolves the tax rule in force for a date (doc 11 §3–§4).
 *
 * Organization rules take precedence over country-pack reference rules with
 * the same key. Within a scope, the effective-dated row whose range contains
 * the date wins — never "latest row" by created_at.
 */
export function resolveTaxRateForDate(
  rules: readonly TaxRuleRecord[],
  on: BusinessDate,
  options: { key?: string; preferDefault?: boolean } = {},
): TaxResolutionExplanation {
  const keyFilter = options.key;
  const candidates = rules.filter((rule) => {
    if (keyFilter && rule.key !== keyFilter) return false;
    if (options.preferDefault && !rule.isDefault) return false;
    return isEffectiveOn(rule, on);
  });

  const orgRules = candidates.filter((rule) => rule.organizationId !== null);
  const packRules = candidates.filter((rule) => rule.organizationId === null);

  const orgSelected = selectEffective(orgRules, on);
  const packSelected = orgSelected ? null : selectEffective(packRules, on);
  const selected = orgSelected ?? packSelected;

  const resolved: ResolvedTaxRate | null = selected
    ? {
        ruleId: selected.id,
        key: selected.key,
        name: selected.name,
        method: selected.method,
        ratePercent: selected.ratePercent,
        scope: selected.organizationId ? 'organization' : 'country_pack',
        validFrom: selected.validFrom,
        validTo: selected.validTo,
      }
    : null;

  return {
    date: on,
    resolved,
    consideredRuleCount: candidates.length,
    usedOrgOverride: orgSelected !== null,
  };
}

/** Finds the default tax rule for an organization on a given date. */
export function resolveDefaultTaxRate(
  rules: readonly TaxRuleRecord[],
  on: BusinessDate,
): TaxResolutionExplanation {
  const defaultRules = rules.filter((rule) => rule.isDefault);
  return resolveTaxRateForDate(defaultRules, on);
}

import type { BusinessDate } from '@/shared/dates';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { resolveDefaultTaxRate, resolveTaxRateForDate } from '../domain/resolve';
import type { TaxResolutionExplanation, TaxRuleRecord } from '../domain/types';
import { listTaxRulesForOrganization } from '../data/tax-rules.repository';

export async function listTaxRules(context: OrgContext): Promise<TaxRuleRecord[]> {
  assertPermission(context, PERMISSIONS.TAX_MANAGE);
  return listTaxRulesForOrganization(
    context.db,
    context.organizationId,
    context.organization.countryCode,
  );
}

export async function resolveTaxForDate(
  context: OrgContext,
  on: BusinessDate,
  key?: string,
): Promise<TaxResolutionExplanation> {
  assertPermission(context, PERMISSIONS.TAX_MANAGE);
  const rules = await listTaxRulesForOrganization(
    context.db,
    context.organizationId,
    context.organization.countryCode,
  );
  if (key) return resolveTaxRateForDate(rules, on, { key });
  return resolveDefaultTaxRate(rules, on);
}

/**
 * Resolves the default tax rule for financial calculations (contracts, etc.).
 * Does not require TAX_MANAGE - callers must already be authorized for the
 * surrounding financial write.
 */
export async function resolveApplicableDefaultTax(
  context: OrgContext,
  on: BusinessDate,
): Promise<TaxResolutionExplanation> {
  const rules = await listTaxRulesForOrganization(
    context.db,
    context.organizationId,
    context.organization.countryCode,
  );
  return resolveDefaultTaxRate(rules, on);
}

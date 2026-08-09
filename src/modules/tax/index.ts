/** Public API of the tax module (docs 11, 65 G1). */
export { resolveTaxRateForDate, resolveDefaultTaxRate } from './domain/resolve';
export type {
  TaxRuleRecord,
  TaxRuleScope,
  ResolvedTaxRate,
  TaxResolutionExplanation,
} from './domain/types';
export { listTaxRules, resolveTaxForDate } from './application/queries';
export { createOrgTaxRule, updateOrgTaxRule } from './application/manage-tax-rules';
export {
  createTaxRuleSchema,
  updateTaxRuleSchema,
  resolveTaxSchema,
  type CreateTaxRuleInput,
  type UpdateTaxRuleInput,
} from './validation/schemas';

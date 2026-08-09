/** Public API of the tax module (docs 11, 65 G1). */
export { resolveTaxRateForDate, resolveDefaultTaxRate } from './domain/resolve';
export {
  computeTaxAmountBreakdown,
  buildContractTaxSnapshot,
  netFromInclusiveGross,
  assertInclusiveTaxRateAvailable,
} from './domain/amounts';
export type {
  AmountTaxMode,
  ContractTaxSnapshot,
  TaxAmountBreakdown,
} from './domain/amounts';
export type {
  TaxRuleRecord,
  TaxRuleScope,
  ResolvedTaxRate,
  TaxResolutionExplanation,
} from './domain/types';
export { listTaxRules, resolveTaxForDate, resolveApplicableDefaultTax } from './application/queries';
export { createOrgTaxRule, updateOrgTaxRule } from './application/manage-tax-rules';
export {
  createTaxRuleSchema,
  updateTaxRuleSchema,
  resolveTaxSchema,
  type CreateTaxRuleInput,
  type UpdateTaxRuleInput,
} from './validation/schemas';

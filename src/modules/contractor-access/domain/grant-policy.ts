import {
  ALL_EXTERNAL_CAPABILITIES,
  EXTERNAL_CAPABILITIES,
  EXTERNAL_GRANT_TEMPLATES,
  FINANCIAL_EXTERNAL_CAPABILITIES,
  isExternalCapability,
  type ExternalCapability,
  type ExternalGrantTemplateKey,
} from '@/shared/external';

/** Pure rules for contractor grants (who may receive which external capabilities, where). */

export const CUSTOM_GRANT_TEMPLATE = 'custom';
export type GrantTemplateChoice = ExternalGrantTemplateKey | typeof CUSTOM_GRANT_TEMPLATE;

export const GRANT_TEMPLATE_KEYS = Object.keys(EXTERNAL_GRANT_TEMPLATES) as ExternalGrantTemplateKey[];

export function isGrantTemplateChoice(value: string): value is GrantTemplateChoice {
  return value === CUSTOM_GRANT_TEMPLATE || (GRANT_TEMPLATE_KEYS as string[]).includes(value);
}

export type GrantRuleViolation =
  | 'unknown_capability'
  | 'empty_capabilities'
  | 'financial_requires_financial_grantor'
  | 'vendor_wide_requires_org_admin'
  | 'agreement_requires_project'
  | 'expiry_in_past';

export class GrantRuleError extends Error {
  constructor(readonly violation: GrantRuleViolation) {
    super(`contractor grant rule: ${violation}`);
    this.name = 'GrantRuleError';
  }
}

/** Ordered as in the frozen catalog so stored scopes are stable / diffable. */
export function normalizeExternalCapabilities(values: readonly string[]): ExternalCapability[] {
  const unknown = values.find((value) => !isExternalCapability(value));
  if (unknown) throw new GrantRuleError('unknown_capability');
  const wanted = new Set(values);
  if (wanted.size === 0) throw new GrantRuleError('empty_capabilities');
  // Every contractor capability is meaningless without seeing the project.
  wanted.add(EXTERNAL_CAPABILITIES.PROJECT_VIEW);
  return ALL_EXTERNAL_CAPABILITIES.filter((capability) => wanted.has(capability));
}

export function resolveGrantCapabilities(
  template: GrantTemplateChoice,
  custom: readonly string[] | undefined,
): ExternalCapability[] {
  if (template === CUSTOM_GRANT_TEMPLATE) return normalizeExternalCapabilities(custom ?? []);
  return normalizeExternalCapabilities(EXTERNAL_GRANT_TEMPLATES[template]);
}

export function hasFinancialExternalCapability(capabilities: Iterable<string>): boolean {
  for (const capability of capabilities) {
    if ((FINANCIAL_EXTERNAL_CAPABILITIES as readonly string[]).includes(capability)) return true;
  }
  return false;
}

export interface GrantScopeInput {
  readonly projectId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly expiresAt: Date | null;
}

export interface GrantorAuthority {
  readonly isOrgProjectAdmin: boolean;
  /** Holds `contract.financial.view` on the grant's project (or is org project admin). */
  readonly canGrantFinancial: boolean;
}

/** Throws GrantRuleError; mirrors the DB guard `app.can_manage_contractor_access`. */
export function assertGrantAllowed(
  scope: GrantScopeInput,
  capabilities: readonly ExternalCapability[],
  grantor: GrantorAuthority,
  now: Date = new Date(),
): void {
  if (!scope.projectId && !grantor.isOrgProjectAdmin) throw new GrantRuleError('vendor_wide_requires_org_admin');
  if (scope.subcontractAgreementId && !scope.projectId) throw new GrantRuleError('agreement_requires_project');
  if (scope.expiresAt && scope.expiresAt.getTime() <= now.getTime()) throw new GrantRuleError('expiry_in_past');
  if (hasFinancialExternalCapability(capabilities) && !grantor.canGrantFinancial) {
    throw new GrantRuleError('financial_requires_financial_grantor');
  }
}

export type ContractorPrincipalStatus = 'invited' | 'active' | 'disabled';

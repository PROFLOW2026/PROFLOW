import type { ComplianceRequirementKind } from './types';

/**
 * Standard Israeli subcontractor requirement set (applied per agreement, editable afterwards).
 * Titles are stored in the organization's language at apply time via the caller (i18n keys
 * `contractorCompliance.kinds.<kind>`); this module only knows kinds and defaults.
 */
export interface StandardRequirementTemplate {
  readonly kind: ComplianceRequirementKind;
  readonly isRequired: boolean;
  readonly blocksPayment: boolean;
  readonly requiresExpiry: boolean;
  readonly warningDays: number;
}

export const STANDARD_REQUIREMENT_SET: readonly StandardRequirementTemplate[] = [
  { kind: 'insurance', isRequired: true, blocksPayment: true, requiresExpiry: true, warningDays: 30 },
  { kind: 'tax_certificate', isRequired: true, blocksPayment: true, requiresExpiry: true, warningDays: 30 },
  { kind: 'bookkeeping_certificate', isRequired: true, blocksPayment: true, requiresExpiry: true, warningDays: 30 },
  { kind: 'safety_certification', isRequired: true, blocksPayment: false, requiresExpiry: true, warningDays: 30 },
  { kind: 'license', isRequired: false, blocksPayment: false, requiresExpiry: true, warningDays: 30 },
  { kind: 'guarantee', isRequired: false, blocksPayment: false, requiresExpiry: true, warningDays: 45 },
];

/** Templates whose kind is not yet present on the agreement (re-applying never duplicates). */
export function missingStandardKinds(
  existingKinds: readonly ComplianceRequirementKind[],
  kinds: readonly ComplianceRequirementKind[] = STANDARD_REQUIREMENT_SET.map((row) => row.kind),
): StandardRequirementTemplate[] {
  const present = new Set(existingKinds);
  return STANDARD_REQUIREMENT_SET.filter((row) => kinds.includes(row.kind) && !present.has(row.kind));
}

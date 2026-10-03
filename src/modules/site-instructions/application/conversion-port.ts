import type { OrgContext } from '@/shared/auth/context';
import type { InstructionConversionTarget } from '../validation/schemas';

/**
 * Port to Track E (subcontract changes / unpriced work). When `@/modules/subcontracts` exports
 * `createChangeFromInstruction`, `convertWithSubcontracts` calls it and returns the created record;
 * until then it returns null and the instruction stays `conversion_state = 'pending'` with a
 * `field.instruction.conversion_requested` domain event for the commercial team.
 */

export interface InstructionConversionRequest {
  readonly organizationId: string;
  readonly projectId: string;
  readonly instructionId: string;
  readonly instructionNumber: number;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly target: InstructionConversionTarget;
}

export interface InstructionConversionResult {
  /** entity_links target type, e.g. 'subcontract_change' / 'unpriced_work'. */
  readonly targetType: string;
  readonly targetId: string;
}

export async function convertWithSubcontracts(
  _context: OrgContext,
  _request: InstructionConversionRequest,
): Promise<InstructionConversionResult | null> {
  return null;
}

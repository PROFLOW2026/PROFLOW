import type { OrgContext } from '@/shared/auth/context';
import { createChangeFromInstruction } from '@/modules/subcontracts';
import type { InstructionConversionTarget } from '../validation/schemas';

/**
 * Port to Track E (subcontract changes / unpriced work). Creates a draft change from
 * a site instruction when an agreement is linked; otherwise returns null so the
 * instruction stays pending conversion.
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
  context: OrgContext,
  request: InstructionConversionRequest,
): Promise<InstructionConversionResult | null> {
  if (request.target !== 'change') return null;
  if (!request.subcontractAgreementId) return null;

  const { changeId } = await createChangeFromInstruction(context, {
    agreementId: request.subcontractAgreementId,
    instructionId: request.instructionId,
    title: request.title,
    description: request.description ?? undefined,
    changeType: 'instruction',
    sourceEntityType: 'site_instruction',
  });

  return { targetType: 'subcontract_change', targetId: changeId };
}

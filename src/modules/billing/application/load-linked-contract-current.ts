import type { OrgContext } from '@/shared/auth/context';
import { fromNumericString, toNumericString } from '@/shared/money';
import {
  computeCurrentContractValue,
  findContractById,
  listContractValueEvents,
} from '@/modules/projects';

/**
 * Linked contract current value (approved events, else original).
 * Pending changes are not events and stay out of this number.
 */
export async function loadLinkedContractCurrentAmount(
  context: OrgContext,
  contractId: string | null | undefined,
  currency: string,
): Promise<string | null> {
  if (!contractId) return null;
  const contract = await findContractById(context.db, context.organizationId, contractId);
  if (!contract) return null;
  const events = await listContractValueEvents(context.db, context.organizationId, contract.id);
  const current =
    events.length > 0
      ? computeCurrentContractValue(events, currency)
      : fromNumericString(contract.originalValueAmount ?? '', currency);
  return current ? toNumericString(current) : null;
}

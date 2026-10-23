import type { OrgContext } from '@/shared/auth/context';
import { findSimilarContracts } from '../data/contracts.repository';

export async function listSimilarContracts(
  context: OrgContext,
  input: {
    readonly excludeContractId: string;
    readonly projectId: string;
    readonly contractNumber: string | null;
    readonly name: string | null;
  },
) {
  return findSimilarContracts(context.db, context.organizationId, input);
}

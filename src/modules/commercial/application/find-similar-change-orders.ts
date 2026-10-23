import type { OrgContext } from '@/shared/auth/context';
import { findSimilarChangeOrders } from '../data/quotes.repository';

export async function listSimilarChangeOrders(
  context: OrgContext,
  input: {
    readonly excludeChangeOrderId: string;
    readonly projectId: string;
    readonly reference: string | null;
  },
) {
  return findSimilarChangeOrders(context.db, context.organizationId, input);
}

import type { OrgContext } from '@/shared/auth/context';
import { findSimilarOpportunities, findSimilarProspects } from '../data/crm.repository';

export async function listSimilarOpportunities(
  context: OrgContext,
  input: {
    readonly excludeOpportunityId: string;
    readonly name: string;
    readonly expectedStartDate: string | null;
  },
) {
  return findSimilarOpportunities(context.db, context.organizationId, input);
}

export async function listSimilarProspects(
  context: OrgContext,
  input: {
    readonly excludeProspectId: string;
    readonly name: string;
    readonly email: string | null;
  },
) {
  return findSimilarProspects(context.db, context.organizationId, input);
}

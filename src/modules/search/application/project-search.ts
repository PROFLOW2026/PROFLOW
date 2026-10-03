/**
 * Project-capability search. Discovery is limited to projects the viewer can
 * open. Contract money is attached only for projects that hold
 * `contract.financial.view`. Claim rows never select amount columns.
 */

import { PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import {
  loadProjectSearchAudience,
  projectAllowsContractMoney,
  projectIdsHolding,
} from '../data/project-search-audience';
import {
  searchContractorAmounts,
  searchCoordinationEvents,
  searchProjectClaims,
  searchProjectContractors,
  searchProjectDefects,
  searchProjectDrawings,
  searchProjectInstructions,
  searchProjectLocations,
  searchProjectMeetings,
  searchProjectRfis,
  searchProjectSubmittals,
} from '../data/project-search.repository';
import {
  mapClaimSearchHit,
  mapContractorSearchHit,
  mapCoordinationSearchHit,
  mapDefectSearchHit,
  mapDrawingSearchHit,
  mapInstructionSearchHit,
  mapLocationSearchHit,
  mapMeetingSearchHit,
  mapRfiSearchHit,
  mapSubmittalSearchHit,
} from '../domain/project-hit-map';
import type { GlobalSearchHit } from '../domain/types';

export async function searchProjectCapabilityHits(
  context: OrgContext,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const exact = query.trim();
  if (!exact) return [];

  const audience = await loadProjectSearchAudience(context);
  const db = context.db;
  const organizationId = context.organizationId;

  const contractorIds = projectIdsHolding(audience, [C.CONTRACTOR_VIEW]);
  const coordinationIds = projectIdsHolding(audience, [C.SCHEDULE_VIEW, C.CONTRACTOR_COORDINATE]);
  const claimIds = projectIdsHolding(audience, [C.CLAIM_VIEW]);
  const projectViewIds = projectIdsHolding(audience, [C.PROJECT_VIEW]);
  const drawingIds = projectIdsHolding(audience, [C.DOCUMENTS_VIEW]);
  const instructionIds = projectIdsHolding(audience, [C.CONTRACTOR_VIEW]);

  const [
    contractors,
    events,
    claims,
    rfis,
    submittals,
    defects,
    drawings,
    locations,
    meetings,
    instructions,
  ] = await Promise.all([
    searchProjectContractors(db, organizationId, exact, contractorIds, limit),
    searchCoordinationEvents(db, organizationId, exact, coordinationIds, limit),
    searchProjectClaims(db, organizationId, exact, claimIds, limit),
    searchProjectRfis(db, organizationId, exact, projectViewIds, limit),
    searchProjectSubmittals(db, organizationId, exact, projectViewIds, limit),
    searchProjectDefects(db, organizationId, exact, projectViewIds, limit),
    searchProjectDrawings(db, organizationId, exact, drawingIds, limit),
    searchProjectLocations(db, organizationId, exact, projectViewIds, limit),
    searchProjectMeetings(db, organizationId, exact, projectViewIds, limit),
    searchProjectInstructions(db, organizationId, exact, instructionIds, limit),
  ]);

  const moneyIds = contractors
    .filter((row) => projectAllowsContractMoney(audience, row.projectId))
    .map((row) => row.agreementId);
  const amounts =
    moneyIds.length === 0
      ? new Map<string, { amount: string; currency: string }>()
      : await searchContractorAmounts(
          db,
          organizationId,
          moneyIds,
          audience.admin ? null : contractors.filter((row) => projectAllowsContractMoney(audience, row.projectId)).map((row) => row.projectId),
        );

  const contractorHits = contractors.map((row) => {
    const includeMoney = projectAllowsContractMoney(audience, row.projectId);
    const money = includeMoney ? amounts.get(row.agreementId) : null;
    return mapContractorSearchHit(
      { ...row, amount: money?.amount ?? null, currency: money?.currency ?? null },
      includeMoney && Boolean(money),
    );
  });

  return [
    ...contractorHits,
    ...events.map(mapCoordinationSearchHit),
    ...claims.map((row) => mapClaimSearchHit(row, false)),
    ...rfis.map(mapRfiSearchHit),
    ...submittals.map(mapSubmittalSearchHit),
    ...defects.map(mapDefectSearchHit),
    ...drawings.map(mapDrawingSearchHit),
    ...locations.map(mapLocationSearchHit),
    ...meetings.map(mapMeetingSearchHit),
    ...instructions.map(mapInstructionSearchHit),
  ];
}

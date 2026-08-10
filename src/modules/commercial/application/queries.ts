import { attachEntryBaselineContext } from '@/modules/financials';
import type { CommercialPosition } from '@/modules/financials/domain/types';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { computeCommercialPosition } from '../domain/contract-value';
import type { ChangeRequestDetail, ChangeRequestListItem } from '../domain/types';
import {
  findChangeRequestById,
  listChangeRequestsAcrossProjects,
  listChangeRequestsForProject,
  listChangeRequestLines,
  listPendingChangesForProject,
  listWorkPackageNamesForChangeRequests,
} from '../data/change-requests.repository';
import {
  findPrimaryContractForProject,
  listContractValueEvents,
} from '../data/contracts.repository';
import {
  findChangeOrderByChangeRequest,
  findQuoteForChangeRequest,
  listQuoteVersions,
} from '../data/quotes.repository';
import type { ListChangesFilterInput } from '../validation/schemas';

export async function listProjectChangeRequests(
  context: OrgContext,
  projectId: string,
): Promise<ChangeRequestListItem[]> {
  assertPermission(context, PERMISSIONS.CHANGES_READ);

  const rows = await listChangeRequestsForProject(context.db, context.organizationId, projectId);
  const namesById = await listWorkPackageNamesForChangeRequests(
    context.db,
    context.organizationId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    ...row,
    projectName: '',
    pricedAmount: null,
    workPackageNames: namesById.get(row.id) ?? [],
  }));
}

export async function listAllChangeRequests(
  context: OrgContext,
  filters: ListChangesFilterInput = { status: 'all' },
): Promise<ChangeRequestListItem[]> {
  assertPermission(context, PERMISSIONS.CHANGES_READ);

  const items = await listChangeRequestsAcrossProjects(context.db, context.organizationId, {
    status: filters.status,
  });
  const namesById = await listWorkPackageNamesForChangeRequests(
    context.db,
    context.organizationId,
    items.map((item) => item.id),
  );

  return items.map((item) => ({
    ...item,
    workPackageNames: namesById.get(item.id) ?? [],
  }));
}

export async function getChangeRequestDetail(
  context: OrgContext,
  changeRequestId: string,
): Promise<ChangeRequestDetail> {
  assertPermission(context, PERMISSIONS.CHANGES_READ);

  const changeRequest = await findChangeRequestById(
    context.db,
    context.organizationId,
    changeRequestId,
  );
  if (!changeRequest) throw new NotFoundError('Change request');

  const [lines, quote, changeOrder] = await Promise.all([
    listChangeRequestLines(context.db, context.organizationId, changeRequestId),
    findQuoteForChangeRequest(context.db, context.organizationId, changeRequestId),
    findChangeOrderByChangeRequest(context.db, context.organizationId, changeRequestId),
  ]);

  const quoteVersions = quote
    ? await listQuoteVersions(context.db, context.organizationId, quote.id)
    : [];

  return {
    ...changeRequest,
    projectName: '',
    lines,
    quote,
    quoteVersions,
    changeOrder,
  };
}

export async function getProjectCommercialSummary(
  context: OrgContext,
  projectId: string,
): Promise<{ position: CommercialPosition; currency: string } | null> {
  assertPermission(context, PERMISSIONS.CHANGES_READ);

  const contract = await findPrimaryContractForProject(
    context.db,
    context.organizationId,
    projectId,
  );
  if (!contract) return null;

  const [events, pendingRows] = await Promise.all([
    listContractValueEvents(context.db, context.organizationId, contract.id),
    listPendingChangesForProject(context.db, context.organizationId, projectId),
  ]);

  const position = computeCommercialPosition({
    valueEvents: events,
    pendingChanges: pendingRows,
    currency: contract.currency,
    originalValueFallback: contract.originalValueAmount,
  });

  return {
    position: attachEntryBaselineContext(position, contract),
    currency: contract.currency,
  };
}

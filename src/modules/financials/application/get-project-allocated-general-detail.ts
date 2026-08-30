import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isZeroMoney, type MoneyValue } from '@/shared/money';
import { loadProjectAllocatedGeneralAttributionRows } from '../data/project-allocated-general-detail.repository';
import { actualRecognitionThroughYearMonth } from '../domain/general-cost-actual-recognition';
import { resolveRecognizedGeneralAllocationForProject } from './resolve-project-general-allocations';
import {
  buildProjectAllocatedGeneralDetail,
  type ProjectAllocatedGeneralDetail,
} from '../domain/project-allocated-general-detail';

export async function getProjectAllocatedGeneralDetail(
  context: OrgContext,
  projectId: string,
  expectedTotal?: MoneyValue | null,
): Promise<ProjectAllocatedGeneralDetail | null> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const currency = context.organization.baseCurrency;
  const throughYearMonth = actualRecognitionThroughYearMonth(context.organization.timezone);

  const totalRaw = expectedTotal
    ? expectedTotal
    : await resolveRecognizedGeneralAllocationForProject(context, projectId, currency);

  if (!totalRaw || isZeroMoney(totalRaw)) return null;

  const rawRows = await loadProjectAllocatedGeneralAttributionRows(
    context.db,
    context.organizationId,
    projectId,
    currency,
    { throughYearMonth },
  );

  return buildProjectAllocatedGeneralDetail({
    expectedTotal: totalRaw,
    rawRows,
  });
}

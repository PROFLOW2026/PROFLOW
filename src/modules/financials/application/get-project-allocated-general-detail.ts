import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { fromNumericString, isZeroMoney, type MoneyValue } from '@/shared/money';
import { sumGeneralAllocationsForProject } from '../data/general-cost-months.repository';
import { loadProjectAllocatedGeneralAttributionRows } from '../data/project-allocated-general-detail.repository';
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

  const totalRaw = expectedTotal
    ? expectedTotal
    : fromNumericString(
        await sumGeneralAllocationsForProject(
          context.db,
          context.organizationId,
          projectId,
          currency,
        ),
        currency,
      );

  if (!totalRaw || isZeroMoney(totalRaw)) return null;

  const rawRows = await loadProjectAllocatedGeneralAttributionRows(
    context.db,
    context.organizationId,
    projectId,
    currency,
  );

  return buildProjectAllocatedGeneralDetail({
    expectedTotal: totalRaw,
    rawRows,
  });
}

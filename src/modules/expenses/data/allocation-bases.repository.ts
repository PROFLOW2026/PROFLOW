import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  contractValueEvents,
  contracts,
  expenses,
  organizationSettings,
  projects,
  timeEntries,
} from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { computeCurrentContractValue } from '@/modules/commercial';
import type { ContractValueEventRecord } from '@/modules/commercial/domain/types';
import type { AllocationMethod, ProjectWeightBasis } from '../domain/types';
import type { ProjectEligibilityFacts } from '../domain/allocation-eligibility';
import { type AllocationPeriod } from '../domain/allocation-eligibility';
import {
  ORG_ALLOCATION_DEFAULT_METHOD_KEY,
  parseAllocationMethodSetting,
} from '../domain/allocation-policy';
import { equalSplitBases } from '../domain/allocation';

export async function listProjectsForAllocationEligibility(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectEligibilityFacts[]> {
  const rows = await db
    .select({
      id: projects.id,
      status: projects.status,
      startDate: projects.startDate,
      actualEndDate: projects.actualEndDate,
      targetEndDate: projects.targetEndDate,
      archivedAt: projects.archivedAt,
      workKind: projects.workKind,
      pricingMode: projects.pricingMode,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    startDate: row.startDate as BusinessDate | null,
    actualEndDate: row.actualEndDate as BusinessDate | null,
    targetEndDate: row.targetEndDate as BusinessDate | null,
    archivedAt: row.archivedAt,
    workKind: row.workKind,
    pricingMode: row.pricingMode,
  }));
}

export async function loadContractNetBases(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<ProjectWeightBasis[]> {
  if (projectIds.length === 0) return [];

  const contractRows = await db
    .select({
      id: contracts.id,
      projectId: contracts.projectId,
      currency: contracts.currency,
      status: contracts.status,
      isPrimary: contracts.isPrimary,
      archivedAt: contracts.archivedAt,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        inArray(contracts.projectId, [...projectIds]),
        isNull(contracts.archivedAt),
      ),
    );

  const primaryByProject = new Map<string, (typeof contractRows)[number]>();
  for (const row of contractRows) {
    if (row.status === 'cancelled') continue;
    const existing = primaryByProject.get(row.projectId);
    if (!existing || (row.isPrimary && !existing.isPrimary)) {
      primaryByProject.set(row.projectId, row);
    }
  }

  const contractIds = [...primaryByProject.values()].map((row) => row.id);
  const eventsByContract = new Map<string, ContractValueEventRecord[]>();

  if (contractIds.length > 0) {
    const eventRows = await db
      .select({
        id: contractValueEvents.id,
        organizationId: contractValueEvents.organizationId,
        contractId: contractValueEvents.contractId,
        projectId: contractValueEvents.projectId,
        amount: contractValueEvents.amount,
        currency: contractValueEvents.currency,
        kind: contractValueEvents.kind,
        changeOrderId: contractValueEvents.changeOrderId,
        effectiveDate: contractValueEvents.effectiveDate,
      })
      .from(contractValueEvents)
      .where(
        and(
          eq(contractValueEvents.organizationId, organizationId),
          inArray(contractValueEvents.contractId, contractIds),
        ),
      );

    for (const event of eventRows) {
      const list = eventsByContract.get(event.contractId) ?? [];
      list.push({
        id: event.id,
        organizationId: event.organizationId,
        contractId: event.contractId,
        projectId: event.projectId,
        amount: event.amount,
        currency: event.currency,
        kind: event.kind as ContractValueEventRecord['kind'],
        changeOrderId: event.changeOrderId,
        effectiveDate: event.effectiveDate,
      });
      eventsByContract.set(event.contractId, list);
    }
  }

  return projectIds
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((projectId) => {
      const contract = primaryByProject.get(projectId);
      if (!contract) {
        return { projectId, basisValue: '0', basisUnit: 'money' as const };
      }
      const events = eventsByContract.get(contract.id) ?? [];
      const net = computeCurrentContractValue(events, contract.currency || currency);
      return {
        projectId,
        basisValue: net.amount,
        basisUnit: 'money' as const,
      };
    });
}

export async function loadLaborHoursBases(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  period: AllocationPeriod,
): Promise<ProjectWeightBasis[]> {
  if (projectIds.length === 0) return [];

  const rows = await db
    .select({
      projectId: timeEntries.projectId,
      hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)::text`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.kind, 'project'),
        eq(timeEntries.status, 'recorded'),
        eq(timeEntries.approvalStatus, 'approved'),
        isNull(timeEntries.archivedAt),
        inArray(timeEntries.projectId, [...projectIds]),
        gte(timeEntries.workDate, period.start),
        lte(timeEntries.workDate, period.end),
      ),
    )
    .groupBy(timeEntries.projectId);

  const hoursByProject = new Map(rows.map((row) => [row.projectId!, row.hours]));

  return projectIds
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((projectId) => ({
      projectId,
      basisValue: hoursByProject.get(projectId) ?? '0',
      basisUnit: 'hours' as const,
    }));
}

/**
 * Valid direct project costs in period: finalized, not archived, project-targeted,
 * cost_family = direct_project, expense_date within period. Uses NET.
 */
export async function loadDirectCostBases(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  period: AllocationPeriod,
  currency: string,
): Promise<ProjectWeightBasis[]> {
  if (projectIds.length === 0) return [];

  const rows = await db
    .select({
      projectId: expenses.projectId,
      total: sql<string>`coalesce(sum(${expenses.netAmount}), 0)::text`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        eq(expenses.costFamily, 'direct_project'),
        eq(expenses.currency, currency),
        inArray(expenses.projectId, [...projectIds]),
        gte(expenses.expenseDate, period.start),
        lte(expenses.expenseDate, period.end),
      ),
    )
    .groupBy(expenses.projectId);

  const byProject = new Map(rows.map((row) => [row.projectId!, row.total]));

  return projectIds
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((projectId) => ({
      projectId,
      basisValue: byProject.get(projectId) ?? '0',
      basisUnit: 'money' as const,
    }));
}

export async function loadOrganizationDefaultAllocationMethod(
  db: DbExecutor,
  organizationId: string,
): Promise<AllocationMethod | null> {
  const [row] = await db
    .select({ value: organizationSettings.value })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.organizationId, organizationId),
        eq(organizationSettings.key, ORG_ALLOCATION_DEFAULT_METHOD_KEY),
      ),
    )
    .limit(1);

  return parseAllocationMethodSetting(row?.value);
}

export async function resolveWeightBasesForMethod(
  db: DbExecutor,
  organizationId: string,
  method: 'contract_weight' | 'labor_hours_weight' | 'direct_cost_weight' | 'equal_split',
  period: AllocationPeriod,
  projectIds: readonly string[],
  currency: string,
): Promise<ProjectWeightBasis[]> {
  switch (method) {
    case 'equal_split':
      return equalSplitBases(projectIds);
    case 'contract_weight':
      return loadContractNetBases(db, organizationId, projectIds, currency);
    case 'labor_hours_weight':
      return loadLaborHoursBases(db, organizationId, projectIds, period);
    case 'direct_cost_weight':
      return loadDirectCostBases(db, organizationId, projectIds, period, currency);
    default: {
      const _exhaustive: never = method;
      return _exhaustive;
    }
  }
}

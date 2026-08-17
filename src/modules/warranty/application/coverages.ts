import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject, findProjectById, findWorkPackageById } from '@/modules/projects';
import { getVendorById } from '@/modules/vendors';
import { parseOrThrow } from './parse';
import { assertWarrantyDateOrder, deriveCoverageStatus } from '../domain/dates';
import type { WarrantyCoverageListItem, WarrantyCoverageRecord, WarrantyIssueRecord } from '../domain/types';
import {
  findCoverageById,
  insertCoverage,
  listCoveragesByProject,
  listCoveragesForOrg,
  listIssuesByCoverageIds,
  updateCoverageById,
} from '../data/warranty.repository';
import {
  createWarrantyCoverageSchema,
  updateWarrantyCoverageSchema,
  type CreateWarrantyCoverageInput,
  type UpdateWarrantyCoverageInput,
} from '../validation/schemas';

async function loadProject(context: OrgContext, projectId: string) {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');
  await assertCanAccessProject(context, projectId);
  return project;
}

export async function listProjectWarrantyCoverages(
  context: OrgContext,
  projectId: string,
): Promise<{
  readonly coverages: readonly WarrantyCoverageRecord[];
  readonly issuesByCoverageId: Readonly<Record<string, readonly WarrantyIssueRecord[]>>;
}> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  await loadProject(context, projectId);
  const coverages = await listCoveragesByProject(context.db, context.organizationId, projectId);
  const issues = await listIssuesByCoverageIds(
    context.db,
    context.organizationId,
    coverages.map((row) => row.id),
  );
  const issuesByCoverageId: Record<string, WarrantyIssueRecord[]> = {};
  for (const issue of issues) {
    const list = issuesByCoverageId[issue.coverageId] ?? [];
    list.push(issue);
    issuesByCoverageId[issue.coverageId] = list;
  }
  return { coverages, issuesByCoverageId };
}

export async function listOrgWarrantyCoverages(
  context: OrgContext,
): Promise<readonly WarrantyCoverageListItem[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  const rows = await listCoveragesForOrg(context.db, context.organizationId);
  const issues = await listIssuesByCoverageIds(
    context.db,
    context.organizationId,
    rows.map((row) => row.coverage.id),
  );
  const openByCoverage = new Map<string, number>();
  for (const issue of issues) {
    if (issue.status === 'open' || issue.status === 'in_progress') {
      openByCoverage.set(issue.coverageId, (openByCoverage.get(issue.coverageId) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({
    ...row.coverage,
    projectName: row.projectName,
    projectStatus: row.projectStatus,
    openIssueCount: openByCoverage.get(row.coverage.id) ?? 0,
  }));
}

export async function createWarrantyCoverage(
  context: OrgContext,
  raw: CreateWarrantyCoverageInput,
): Promise<WarrantyCoverageRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(createWarrantyCoverageSchema.safeParse(raw));
  const project = await loadProject(context, input.projectId);
  assertWarrantyDateOrder(input.startDate ?? null, input.endDate ?? null);

  if (input.workPackageId) {
    const workPackage = await findWorkPackageById(
      context.db,
      context.organizationId,
      input.workPackageId,
    );
    if (!workPackage || workPackage.projectId !== project.id) {
      throw new NotFoundError('Work area');
    }
  }
  if (input.vendorId) {
    await getVendorById(context, input.vendorId);
  }

  const today = todayInTimeZone(context.organization.timezone);
  const coverage = await insertCoverage(context.db, {
    organizationId: context.organizationId,
    projectId: project.id,
    workPackageId: input.workPackageId ?? null,
    vendorId: input.vendorId ?? null,
    coverageType: input.coverageType ?? 'workmanship',
    title: input.title,
    notes: input.notes ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    status: deriveCoverageStatus({
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      today,
    }),
    reminderDaysBefore: input.reminderDaysBefore ?? 30,
    createdByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WARRANTY_CREATED,
    entityType: 'warranty_coverage',
    entityId: coverage.id,
    after: { id: coverage.id, projectId: coverage.projectId, status: coverage.status },
  });
  return coverage;
}

export async function updateWarrantyCoverage(
  context: OrgContext,
  raw: UpdateWarrantyCoverageInput,
): Promise<WarrantyCoverageRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(updateWarrantyCoverageSchema.safeParse(raw));
  const existing = await findCoverageById(context.db, context.organizationId, input.coverageId);
  if (!existing) throw new NotFoundError('Warranty coverage');
  await loadProject(context, existing.projectId);

  const startDate = input.startDate !== undefined ? input.startDate : existing.startDate;
  const endDate = input.endDate !== undefined ? input.endDate : existing.endDate;
  assertWarrantyDateOrder(startDate, endDate);

  const today = todayInTimeZone(context.organization.timezone);
  const voided = input.status === 'void' || existing.status === 'void';
  const status =
    input.status === 'void'
      ? 'void'
      : deriveCoverageStatus({
          startDate: startDate ?? null,
          endDate: endDate ?? null,
          today,
          voided,
        });

  const updated = await updateCoverageById(context.db, context.organizationId, existing.id, {
    title: input.title,
    coverageType: input.coverageType,
    workPackageId: input.workPackageId === undefined ? undefined : input.workPackageId,
    vendorId: input.vendorId === undefined ? undefined : input.vendorId,
    startDate: input.startDate === undefined ? undefined : input.startDate,
    endDate: input.endDate === undefined ? undefined : input.endDate,
    notes: input.notes === undefined ? undefined : input.notes,
    reminderDaysBefore: input.reminderDaysBefore,
    status,
  });
  if (!updated) throw new NotFoundError('Warranty coverage');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WARRANTY_UPDATED,
    entityType: 'warranty_coverage',
    entityId: updated.id,
    before: existing,
    after: updated,
  });
  return updated;
}

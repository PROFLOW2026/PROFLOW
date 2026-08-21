import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject, findProjectById } from '@/modules/projects';
import { createWorkOrder } from '@/modules/service';
import { parseOrThrow } from './parse';
import {
  originalProjectStatusAfterWarrantyWorkOrder,
} from '../domain/work-order-link';
import {
  findCoverageById,
  findIssueById,
  insertIssue,
  updateIssueById,
} from '../data/warranty.repository';
import {
  createWarrantyIssueSchema,
  createWarrantyWorkOrderSchema,
  updateWarrantyIssueSchema,
  type CreateWarrantyIssueInput,
  type CreateWarrantyWorkOrderInput,
  type UpdateWarrantyIssueInput,
} from '../validation/schemas';

async function loadProject(context: OrgContext, projectId: string) {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');
  await assertCanAccessProject(context, projectId);
  return project;
}

export async function createWarrantyIssue(context: OrgContext, raw: CreateWarrantyIssueInput) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(createWarrantyIssueSchema.safeParse(raw));
  const coverage = await findCoverageById(context.db, context.organizationId, input.coverageId);
  if (!coverage) throw new NotFoundError('Warranty coverage');
  await loadProject(context, coverage.projectId);

  const issue = await insertIssue(context.db, {
    organizationId: context.organizationId,
    coverageId: coverage.id,
    projectId: coverage.projectId,
    title: input.title,
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WARRANTY_ISSUE_CREATED,
    entityType: 'warranty_issue',
    entityId: issue.id,
    after: { id: issue.id, coverageId: coverage.id, projectId: coverage.projectId },
  });
  return issue;
}

export async function updateWarrantyIssue(context: OrgContext, raw: UpdateWarrantyIssueInput) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(updateWarrantyIssueSchema.safeParse(raw));
  const existing = await findIssueById(context.db, context.organizationId, input.issueId);
  if (!existing) throw new NotFoundError('Warranty issue');
  await loadProject(context, existing.projectId);

  const nextStatus = input.status ?? existing.status;
  const resolving = nextStatus === 'resolved' && existing.status !== 'resolved';
  const updated = await updateIssueById(context.db, context.organizationId, existing.id, {
    title: input.title,
    notes: input.notes === undefined ? undefined : input.notes,
    status: input.status,
    resolvedAt: resolving ? new Date() : nextStatus === 'resolved' ? existing.resolvedAt : null,
  });
  if (!updated) throw new NotFoundError('Warranty issue');

  await recordAuditEvent(context, {
    action: resolving ? AUDIT_ACTIONS.WARRANTY_ISSUE_RESOLVED : AUDIT_ACTIONS.WARRANTY_UPDATED,
    entityType: 'warranty_issue',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  if (resolving) {
    const { captureBrandSnapshot } = await import('@/modules/branding');
    await captureBrandSnapshot(context, {
      entityType: 'warranty_issue',
      entityId: updated.id,
      projectId: updated.projectId,
    });
  }

  return updated;
}

/**
 * Opens a service work order from a warranty issue. The original project
 * (even if completed) is not reopened. Assignment is not cost.
 */
export async function createWarrantyIssueWorkOrder(
  context: OrgContext,
  raw: CreateWarrantyWorkOrderInput,
) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(createWarrantyWorkOrderSchema.safeParse(raw));
  const issue = await findIssueById(context.db, context.organizationId, input.issueId);
  if (!issue) throw new NotFoundError('Warranty issue');
  const original = await loadProject(context, issue.projectId);
  const statusBefore = original.status;

  if (!original.clientId) {
    throw new DomainRuleError('A customer is required', 'warranty.errors.clientRequired');
  }

  const created = await createWorkOrder(context, {
    name: input.name?.trim() || issue.title,
    clientId: original.clientId,
    pricingMode: 'open',
    description: issue.notes,
    assigneeEmployeeId: input.assigneeEmployeeId ?? null,
    notes: issue.notes ?? null,
  });

  const updated = await updateIssueById(context.db, context.organizationId, issue.id, {
    workOrderId: created.projectId,
    status: issue.status === 'open' ? 'in_progress' : issue.status,
  });

  const after = await findProjectById(context.db, context.organizationId, original.id);
  if (after && after.status !== originalProjectStatusAfterWarrantyWorkOrder(statusBefore)) {
    throw new DomainRuleError('Closed project must stay closed', 'warranty.errors.projectStaysClosed');
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WARRANTY_UPDATED,
    entityType: 'warranty_issue',
    entityId: issue.id,
    after: { workOrderId: created.projectId, originalProjectStatus: statusBefore },
  });

  return { issue: updated ?? issue, workOrderId: created.projectId, originalProjectStatus: statusBefore };
}

import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import { addProjectTeamMember, listProjectTeamMembers } from '@/modules/workforce';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findServiceDetailsByProjectId,
  updateServiceDetailsByProjectId,
} from '../data/service-details.repository';
import { assertWorkOrderCompletionChecklist } from '../domain/checklist-gate';
import {
  canTransitionServiceStatus,
  projectStatusForServiceStatus,
} from '../domain/service-status';
import type { ServiceStatus } from '../domain/types';
import { workOrderHasSubmittedChecklist } from './work-order-checklist';
import {
  updateServiceStatusSchema,
  updateWorkOrderSchema,
  type UpdateServiceStatusInput,
  type UpdateWorkOrderInput,
} from '../validation/schemas';

const SERVICE_OR_DISPATCH = [PERMISSIONS.SERVICE_MANAGE, PERMISSIONS.DISPATCH_MANAGE] as const;

function parseOptionalDateTime(
  value: string | null | undefined,
  path: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError([{ path, message: 'Invalid date/time' }]);
  }
  return new Date(parsed);
}

async function assertWorkOrder(context: OrgContext, workOrderId: string) {
  const [row] = await context.db
    .select({ id: projects.id, workKind: projects.workKind })
    .from(projects)
    .where(
      and(eq(projects.id, workOrderId), eq(projects.organizationId, context.organizationId)),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Work order');
  if (row.workKind !== 'work_order') {
    throw new DomainRuleError(
      'Not a work order',
      'service.notAWorkOrder',
      { workOrderId, workKind: row.workKind },
    );
  }
  return row;
}

export async function updateWorkOrder(
  context: OrgContext,
  rawInput: UpdateWorkOrderInput,
): Promise<void> {
  assertAnyPermission(context, SERVICE_OR_DISPATCH);

  const parsed = updateWorkOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  await assertWorkOrder(context, input.workOrderId);

  const details = await findServiceDetailsByProjectId(
    context.db,
    context.organizationId,
    input.workOrderId,
  );
  if (!details) throw new NotFoundError('Work order service details');

  if (input.serviceStatus && input.serviceStatus !== details.serviceStatus) {
    if (!canTransitionServiceStatus(details.serviceStatus, input.serviceStatus)) {
      throw new DomainRuleError(
        'Invalid service status transition',
        'service.invalidStatusTransition',
        { from: details.serviceStatus, to: input.serviceStatus },
      );
    }
  }

  const nextChecklistTemplateId =
    input.checklistTemplateId !== undefined
      ? input.checklistTemplateId
      : details.checklistTemplateId;
  if (input.serviceStatus === 'completed' && input.serviceStatus !== details.serviceStatus) {
    const submissions =
      nextChecklistTemplateId
        ? [
            {
              templateId: nextChecklistTemplateId,
              status: (await workOrderHasSubmittedChecklist(context, {
                workOrderId: input.workOrderId,
                checklistTemplateId: nextChecklistTemplateId,
              }))
                ? ('submitted' as const)
                : ('draft' as const),
            },
          ]
        : [];
    assertWorkOrderCompletionChecklist({
      targetStatus: input.serviceStatus,
      checklistTemplateId: nextChecklistTemplateId,
      submissions,
    });
  }

  const projectPatch: {
    name?: string;
    description?: string | null;
    location?: string | null;
    notes?: string | null;
    startDate?: string | null;
    status?: ReturnType<typeof projectStatusForServiceStatus>;
    updatedAt: Date;
  } = { updatedAt: new Date() };

  if (input.name !== undefined) projectPatch.name = input.name;
  if (input.description !== undefined) projectPatch.description = input.description ?? null;
  if (input.siteAddress !== undefined) projectPatch.location = input.siteAddress ?? null;
  if (input.notes !== undefined) projectPatch.notes = input.notes ?? null;
  if (input.requestedDate !== undefined) projectPatch.startDate = input.requestedDate ?? null;
  if (input.serviceStatus) {
    projectPatch.status = projectStatusForServiceStatus(input.serviceStatus);
  }

  await context.db
    .update(projects)
    .set(projectPatch)
    .where(
      and(
        eq(projects.id, input.workOrderId),
        eq(projects.organizationId, context.organizationId),
      ),
    );

  await updateServiceDetailsByProjectId(context.db, context.organizationId, input.workOrderId, {
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.serviceStatus !== undefined ? { serviceStatus: input.serviceStatus } : {}),
    ...(input.requestedDate !== undefined ? { requestedDate: input.requestedDate } : {}),
    ...(input.scheduledStartAt !== undefined
      ? { scheduledStartAt: parseOptionalDateTime(input.scheduledStartAt, 'scheduledStartAt') ?? null }
      : {}),
    ...(input.scheduledEndAt !== undefined
      ? { scheduledEndAt: parseOptionalDateTime(input.scheduledEndAt, 'scheduledEndAt') ?? null }
      : {}),
    ...(input.siteAddress !== undefined ? { siteAddress: input.siteAddress } : {}),
    ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
    ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
    ...(input.checklistTemplateId !== undefined
      ? { checklistTemplateId: input.checklistTemplateId }
      : {}),
    ...(input.serviceNotes !== undefined ? { notes: input.serviceNotes } : {}),
  });

  if (input.assigneeEmployeeId) {
    const team = await listProjectTeamMembers(context, input.workOrderId);
    const already = team.some((member) => member.employeeId === input.assigneeEmployeeId);
    if (!already) {
      try {
        await addProjectTeamMember(context, {
          projectId: input.workOrderId,
          employeeId: input.assigneeEmployeeId,
          role: 'assignee',
        });
      } catch {
        // Best-effort when workforce.manage is missing.
      }
    }
  }

  await recordAuditEvent(context, {
    action: 'project.updated',
    entityType: 'project',
    entityId: input.workOrderId,
    after: {
      workKind: 'work_order',
      serviceStatus: input.serviceStatus ?? details.serviceStatus,
    },
  });
}

export async function updateServiceStatus(
  context: OrgContext,
  rawInput: UpdateServiceStatusInput,
): Promise<void> {
  assertAnyPermission(context, SERVICE_OR_DISPATCH);

  const parsed = updateServiceStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  await updateWorkOrder(context, {
    workOrderId: parsed.data.workOrderId,
    serviceStatus: parsed.data.serviceStatus as ServiceStatus,
  });
}

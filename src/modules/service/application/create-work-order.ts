import { createClient } from '@/modules/clients';
import { createProject } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import { addProjectTeamMember } from '@/modules/workforce';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { insertServiceDetails } from '../data/service-details.repository';
import { assertWorkOrderCompletionChecklist } from '../domain/checklist-gate';
import { projectStatusForServiceStatus } from '../domain/service-status';
import type { ServiceStatus } from '../domain/types';
import { createWorkOrderSchema, type CreateWorkOrderInput } from '../validation/schemas';

function parseOptionalDateTime(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError([{ path: 'scheduledStartAt', message: 'Invalid date/time' }]);
  }
  return new Date(parsed);
}

/**
 * Creates a work order on the shared `projects` row (`work_kind=work_order`)
 * plus `project_service_details`. Same financial engine as jobs/projects —
 * never invents a parallel Actual.
 */
export async function createWorkOrder(
  context: OrgContext,
  rawInput: CreateWorkOrderInput,
): Promise<{ projectId: string; clientId: string | null }> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);

  const parsed = createWorkOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  let clientId = input.clientId ?? null;

  if (!clientId && input.clientName) {
    const client = await createClient(context, { name: input.clientName });
    clientId = client.id;
  }

  if (!clientId) {
    throw new ValidationError([{ path: 'clientId', message: 'Customer is required' }]);
  }

  const serviceStatus: ServiceStatus = input.serviceStatus ?? 'new';
  const scheduledStartAt = parseOptionalDateTime(input.scheduledStartAt);
  const scheduledEndAt = parseOptionalDateTime(input.scheduledEndAt);

  // Auto-promote to scheduled when a window is set at create.
  const resolvedStatus: ServiceStatus =
    serviceStatus === 'new' && scheduledStartAt ? 'scheduled' : serviceStatus;

  assertWorkOrderCompletionChecklist({
    targetStatus: resolvedStatus,
    checklistTemplateId: input.checklistTemplateId ?? null,
    submissions: [],
  });

  const result = await createProject(context, {
    name: input.name,
    description: input.description ?? null,
    clientId,
    primaryContactId: input.primaryContactId ?? null,
    workKind: 'work_order',
    pricingMode: input.pricingMode,
    contractValueAmount: input.pricingMode === 'fixed' ? input.priceAmount : null,
    contractValueCurrency: input.priceCurrency,
    amountIncludesTax: input.amountIncludesTax,
    location: input.siteAddress ?? null,
    startDate: input.requestedDate ?? null,
    notes: input.notes ?? null,
    status: projectStatusForServiceStatus(resolvedStatus),
  });

  await insertServiceDetails(context.db, {
    organizationId: context.organizationId,
    projectId: result.projectId,
    category: input.category ?? null,
    priority: input.priority ?? 'normal',
    serviceStatus: resolvedStatus,
    requestedDate: input.requestedDate ?? null,
    scheduledStartAt,
    scheduledEndAt,
    siteAddress: input.siteAddress ?? null,
    contactName: input.contactName ?? null,
    contactPhone: input.contactPhone ?? null,
    checklistTemplateId: input.checklistTemplateId ?? null,
    notes: input.serviceNotes ?? null,
  });

  if (input.assigneeEmployeeId) {
    try {
      await addProjectTeamMember(context, {
        projectId: result.projectId,
        employeeId: input.assigneeEmployeeId,
        role: 'assignee',
      });
    } catch {
      // Team assign requires workforce.manage - WO still created; assignee is best-effort.
    }
  }

  await noteModuleUsage(context.db, context.organizationId, 'service');

  return result;
}

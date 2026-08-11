import { clients } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { noteModuleUsage } from '@/modules/tenancy';
import { findEmployeeById } from '@/modules/workforce';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  advanceOccurrenceDate,
  computeNextOccurrenceDate,
} from '../domain/occurrence-calendar';
import type { RecurrenceDefinitionRecord } from '../domain/types';
import {
  ensurePlannedOccurrence,
  findOccurrenceByDefinitionDate,
  findRecurrenceDefinitionById,
  insertRecurrenceDefinition,
  updateRecurrenceDefinitionById,
  updateRecurrenceOccurrenceById,
} from '../data/recurrence.repository';
import {
  createRecurrenceDefinitionSchema,
  recurrenceDefinitionIdSchema,
  skipOccurrenceSchema,
  updateRecurrenceDefinitionSchema,
  type CreateRecurrenceDefinitionInput,
  type SkipOccurrenceInput,
  type UpdateRecurrenceDefinitionInput,
} from '../validation/schemas';

async function assertClientInOrg(
  context: OrgContext,
  clientId: string | null | undefined,
): Promise<void> {
  if (!clientId) return;
  const [row] = await context.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, context.organizationId)))
    .limit(1);
  if (!row) throw new NotFoundError('Client');
}

async function assertAssigneeInOrg(
  context: OrgContext,
  employeeId: string | null | undefined,
): Promise<void> {
  if (!employeeId) return;
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
}

function pricingModeForStorage(
  mode: string | null | undefined,
): string | null {
  if (!mode || mode === 'none') return null;
  return mode;
}

export async function createRecurrenceDefinition(
  context: OrgContext,
  rawInput: CreateRecurrenceDefinitionInput,
): Promise<RecurrenceDefinitionRecord> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);

  const parsed = createRecurrenceDefinitionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  await assertClientInOrg(context, input.clientId);
  await assertAssigneeInOrg(context, input.defaultAssigneeEmployeeId);

  const definition = await insertRecurrenceDefinition(context.db, {
    organizationId: context.organizationId,
    clientId: input.clientId ?? null,
    title: input.title,
    siteAddress: input.siteAddress ?? null,
    frequency: input.frequency,
    intervalCount: input.intervalCount,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    nextOccurrenceDate: input.startDate,
    defaultDurationMinutes: input.defaultDurationMinutes ?? null,
    defaultPricingMode: pricingModeForStorage(input.defaultPricingMode),
    defaultPriceAmount: input.defaultPriceAmount ?? null,
    currency: (input.currency ?? context.organization.baseCurrency).toUpperCase(),
    defaultChecklistTemplateId: input.defaultChecklistTemplateId ?? null,
    defaultAssigneeEmployeeId: input.defaultAssigneeEmployeeId ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'service');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SERVICE_RECURRENCE_CREATED,
    entityType: 'recurrence_definition',
    entityId: definition.id,
    after: {
      title: definition.title,
      frequency: definition.frequency,
      startDate: definition.startDate,
      clientId: definition.clientId,
    },
  });

  return definition;
}

export async function updateRecurrenceDefinition(
  context: OrgContext,
  rawInput: UpdateRecurrenceDefinitionInput,
): Promise<RecurrenceDefinitionRecord> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);

  const parsed = updateRecurrenceDefinitionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!existing) throw new NotFoundError('Recurrence definition');
  if (existing.status === 'ended') {
    throw new DomainRuleError(
      'Ended recurrences cannot be edited',
      'service.errors.recurrenceEnded',
    );
  }

  const { definitionId: _id, ...rest } = parsed.data;
  if (rest.clientId !== undefined) await assertClientInOrg(context, rest.clientId);
  if (rest.defaultAssigneeEmployeeId !== undefined) {
    await assertAssigneeInOrg(context, rest.defaultAssigneeEmployeeId);
  }

  const startDate = rest.startDate ?? existing.startDate;
  const endDate = rest.endDate !== undefined ? rest.endDate : existing.endDate;
  const frequency = rest.frequency ?? existing.frequency;
  const intervalCount = rest.intervalCount ?? existing.intervalCount;

  let nextOccurrenceDate = existing.nextOccurrenceDate;
  if (rest.startDate || rest.endDate !== undefined || rest.frequency || rest.intervalCount) {
    const onOrAfter =
      existing.nextOccurrenceDate && existing.nextOccurrenceDate > startDate
        ? existing.nextOccurrenceDate
        : startDate;
    nextOccurrenceDate = computeNextOccurrenceDate({
      startDate,
      endDate,
      frequency,
      intervalCount,
      onOrAfter,
    });
  }

  const updated = await updateRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    existing.id,
    {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.clientId !== undefined ? { clientId: rest.clientId } : {}),
      ...(rest.siteAddress !== undefined ? { siteAddress: rest.siteAddress } : {}),
      ...(rest.frequency !== undefined ? { frequency: rest.frequency } : {}),
      ...(rest.intervalCount !== undefined ? { intervalCount: rest.intervalCount } : {}),
      ...(rest.startDate !== undefined ? { startDate: rest.startDate } : {}),
      ...(rest.endDate !== undefined ? { endDate: rest.endDate } : {}),
      ...(rest.defaultDurationMinutes !== undefined
        ? { defaultDurationMinutes: rest.defaultDurationMinutes }
        : {}),
      ...(rest.defaultPricingMode !== undefined
        ? { defaultPricingMode: pricingModeForStorage(rest.defaultPricingMode) }
        : {}),
      ...(rest.defaultPriceAmount !== undefined
        ? { defaultPriceAmount: rest.defaultPriceAmount }
        : {}),
      ...(rest.currency !== undefined
        ? { currency: rest.currency?.toUpperCase() ?? null }
        : {}),
      ...(rest.defaultChecklistTemplateId !== undefined
        ? { defaultChecklistTemplateId: rest.defaultChecklistTemplateId }
        : {}),
      ...(rest.defaultAssigneeEmployeeId !== undefined
        ? { defaultAssigneeEmployeeId: rest.defaultAssigneeEmployeeId }
        : {}),
      ...(rest.notes !== undefined ? { notes: rest.notes } : {}),
      nextOccurrenceDate,
    },
  );

  if (!updated) throw new NotFoundError('Recurrence definition');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SERVICE_RECURRENCE_UPDATED,
    entityType: 'recurrence_definition',
    entityId: updated.id,
    before: { title: existing.title, status: existing.status },
    after: { title: updated.title, status: updated.status, nextOccurrenceDate },
  });

  return updated;
}

export async function pauseRecurrenceDefinition(
  context: OrgContext,
  rawInput: { definitionId: string },
): Promise<RecurrenceDefinitionRecord> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);
  const parsed = recurrenceDefinitionIdSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!existing) throw new NotFoundError('Recurrence definition');
  if (existing.status === 'ended') {
    throw new DomainRuleError(
      'Ended recurrences cannot be paused',
      'service.errors.recurrenceEnded',
    );
  }
  if (existing.status === 'paused') return existing;

  const updated = await updateRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    existing.id,
    { status: 'paused' },
  );
  if (!updated) throw new NotFoundError('Recurrence definition');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SERVICE_RECURRENCE_PAUSED,
    entityType: 'recurrence_definition',
    entityId: updated.id,
    after: { status: 'paused' },
  });

  return updated;
}

export async function resumeRecurrenceDefinition(
  context: OrgContext,
  rawInput: { definitionId: string },
): Promise<RecurrenceDefinitionRecord> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);
  const parsed = recurrenceDefinitionIdSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!existing) throw new NotFoundError('Recurrence definition');
  if (existing.status === 'ended') {
    throw new DomainRuleError(
      'Ended recurrences cannot be resumed',
      'service.errors.recurrenceEnded',
    );
  }
  if (existing.status === 'active') return existing;

  const today = todayInTimeZone(context.organization.timezone);
  const nextOccurrenceDate = computeNextOccurrenceDate({
    startDate: existing.startDate,
    endDate: existing.endDate,
    frequency: existing.frequency,
    intervalCount: existing.intervalCount,
    onOrAfter: existing.nextOccurrenceDate && existing.nextOccurrenceDate > today
      ? existing.nextOccurrenceDate
      : today,
  });

  const updated = await updateRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    existing.id,
    {
      status: nextOccurrenceDate ? 'active' : 'ended',
      nextOccurrenceDate,
    },
  );
  if (!updated) throw new NotFoundError('Recurrence definition');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SERVICE_RECURRENCE_RESUMED,
    entityType: 'recurrence_definition',
    entityId: updated.id,
    after: { status: updated.status, nextOccurrenceDate },
  });

  return updated;
}

export async function endRecurrenceDefinition(
  context: OrgContext,
  rawInput: { definitionId: string },
): Promise<RecurrenceDefinitionRecord> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);
  const parsed = recurrenceDefinitionIdSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!existing) throw new NotFoundError('Recurrence definition');
  if (existing.status === 'ended') return existing;

  const updated = await updateRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    existing.id,
    { status: 'ended', nextOccurrenceDate: null },
  );
  if (!updated) throw new NotFoundError('Recurrence definition');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SERVICE_RECURRENCE_ENDED,
    entityType: 'recurrence_definition',
    entityId: updated.id,
    after: { status: 'ended' },
  });

  return updated;
}

/**
 * Skip a single occurrence date without generating a work order.
 * Advances nextOccurrenceDate when the skipped date is the current cursor.
 */
export async function skipRecurrenceOccurrence(
  context: OrgContext,
  rawInput: SkipOccurrenceInput,
): Promise<RecurrenceDefinitionRecord> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);

  const parsed = skipOccurrenceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!existing) throw new NotFoundError('Recurrence definition');
  if (existing.status === 'ended') {
    throw new DomainRuleError(
      'Ended recurrences cannot skip occurrences',
      'service.errors.recurrenceEnded',
    );
  }

  const occurrenceDate = businessDate(parsed.data.occurrenceDate);
  const prior = await findOccurrenceByDefinitionDate(
    context.db,
    context.organizationId,
    existing.id,
    occurrenceDate,
  );

  if (prior?.status === 'generated') {
    throw new DomainRuleError(
      'Cannot skip an occurrence that already generated a work order',
      'service.errors.occurrenceAlreadyGenerated',
    );
  }

  if (prior) {
    await updateRecurrenceOccurrenceById(context.db, context.organizationId, prior.id, {
      status: 'skipped',
      skippedReason: parsed.data.reason ?? null,
      generatedProjectId: null,
    });
  } else {
    const created = await ensurePlannedOccurrence(context.db, {
      organizationId: context.organizationId,
      recurrenceDefinitionId: existing.id,
      occurrenceDate,
    });
    await updateRecurrenceOccurrenceById(context.db, context.organizationId, created.id, {
      status: 'skipped',
      skippedReason: parsed.data.reason ?? null,
    });
  }

  let nextOccurrenceDate = existing.nextOccurrenceDate;
  if (!nextOccurrenceDate || nextOccurrenceDate <= occurrenceDate) {
    nextOccurrenceDate = computeNextOccurrenceDate({
      startDate: existing.startDate,
      endDate: existing.endDate,
      frequency: existing.frequency,
      intervalCount: existing.intervalCount,
      onOrAfter: advanceOccurrenceDate(
        occurrenceDate,
        existing.frequency,
        existing.intervalCount,
      ),
    });
  }

  const updated = await updateRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    existing.id,
    {
      nextOccurrenceDate,
      ...(nextOccurrenceDate === null && existing.status === 'active'
        ? { status: 'ended' as const }
        : {}),
    },
  );
  if (!updated) throw new NotFoundError('Recurrence definition');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SERVICE_RECURRENCE_OCCURRENCE_SKIPPED,
    entityType: 'recurrence_definition',
    entityId: updated.id,
    after: {
      occurrenceDate,
      reason: parsed.data.reason ?? null,
      nextOccurrenceDate,
    },
  });

  return updated;
}

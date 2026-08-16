import { projects } from '@drizzle/schema';
import { insertWorkPackage } from '@/modules/projects';
import { DEFAULT_WORK_PACKAGE_NAME } from '@/modules/projects/domain/types';
import { noteModuleUsage } from '@/modules/tenancy';
import { findEmployeeById, insertEmployeeProjectAssignment } from '@/modules/workforce';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { addDays, businessDate, todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { insertServiceDetails } from '../../data/service-details.repository';
import {
  advanceOccurrenceDate,
  computeNextOccurrenceDate,
  enumerateOccurrenceDates,
} from '../domain/occurrence-calendar';
import type { RecurrenceDefinitionRecord } from '../domain/types';
import {
  ensurePlannedOccurrence,
  findRecurrenceDefinitionById,
  updateRecurrenceDefinitionById,
  updateRecurrenceOccurrenceById,
} from '../data/recurrence.repository';
import {
  generateOccurrencesSchema,
  type GenerateOccurrencesInput,
} from '../validation/schemas';

export interface GenerateOccurrencesResult {
  readonly definitionId: string;
  readonly generated: readonly {
    readonly occurrenceDate: string;
    readonly projectId: string;
    readonly occurrenceId: string;
  }[];
  readonly skippedExisting: number;
  readonly nextOccurrenceDate: string | null;
}

function scheduledWindow(
  occurrenceDate: string,
  durationMinutes: number | null | undefined,
): { start: Date; end: Date | null } {
  // Noon UTC on the business date - schedule display is refined by Agent 6 dispatch UX.
  const [y, m, d] = occurrenceDate.split('-').map(Number) as [number, number, number];
  const start = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (!durationMinutes || durationMinutes < 1) {
    return { start, end: null };
  }
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { start, end };
}

/**
 * Creates a draft work_order + service details for one occurrence.
 *
 * HARD RULE: never upserts contract / never writes expense / attendance Actual.
 * Template fixed price stays on the recurrence definition only - generated rows
 * use open pricing so no silent revenue basis.
 */
async function createDraftWorkOrderForOccurrence(
  context: OrgContext,
  definition: RecurrenceDefinitionRecord,
  occurrenceDate: string,
): Promise<string> {
  const window = scheduledWindow(occurrenceDate, definition.defaultDurationMinutes);

  const priceHint =
    definition.defaultPricingMode === 'fixed' && definition.defaultPriceAmount
      ? `Template price (not revenue): ${definition.defaultPriceAmount} ${
          definition.currency ?? context.organization.baseCurrency
        }`
      : null;

  const notesParts = [
    definition.notes?.trim() || null,
    priceHint,
    `Generated from recurrence ${definition.id} on ${occurrenceDate}`,
  ].filter(Boolean);

  const [project] = await context.db
    .insert(projects)
    .values({
      organizationId: context.organizationId,
      name: `${definition.title} - ${occurrenceDate}`,
      status: 'draft',
      workKind: 'work_order',
      // Open until a human sets revenue - never auto-contract from template price.
      pricingMode: 'open',
      clientId: definition.clientId,
      currency: null,
      location: definition.siteAddress,
      startDate: occurrenceDate,
      targetEndDate: occurrenceDate,
      notes: notesParts.join('\n') || null,
    })
    .returning({ id: projects.id });

  const projectId = project!.id;

  await insertWorkPackage(context.db, {
    organizationId: context.organizationId,
    projectId,
    name: DEFAULT_WORK_PACKAGE_NAME,
    isDefault: true,
    sortOrder: 0,
  });

  await insertServiceDetails(context.db, {
    organizationId: context.organizationId,
    projectId,
    priority: 'normal',
    serviceStatus: 'scheduled',
    requestedDate: occurrenceDate,
    scheduledStartAt: window.start,
    scheduledEndAt: window.end,
    siteAddress: definition.siteAddress,
    checklistTemplateId: definition.defaultChecklistTemplateId,
    recurrenceDefinitionId: definition.id,
    notes: priceHint,
  });

  if (definition.defaultAssigneeEmployeeId) {
    const employee = await findEmployeeById(
      context.db,
      context.organizationId,
      definition.defaultAssigneeEmployeeId,
    );
    if (employee && !employee.archivedAt) {
      await insertEmployeeProjectAssignment(context.db, {
        organizationId: context.organizationId,
        projectId,
        employeeId: employee.id,
        startDate: occurrenceDate,
        endDate: occurrenceDate,
        role: 'service',
        notes: 'Default assignee from recurrence template',
        status: 'active',
      });
    }
  }

  return projectId;
}

function resolveHorizon(
  context: OrgContext,
  input: { untilInclusive?: string | null; horizonDays?: number },
): string {
  if (input.untilInclusive) return businessDate(input.untilInclusive);
  const days = input.horizonDays ?? 30;
  const today = todayInTimeZone(context.organization.timezone);
  return addDays(today, days);
}

/**
 * Materializes due occurrences as draft/scheduled work orders.
 * Idempotent per (definition, date): already generated/skipped dates are left alone.
 */
export async function generateRecurrenceOccurrences(
  context: OrgContext,
  rawInput: GenerateOccurrencesInput,
): Promise<GenerateOccurrencesResult> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);

  const parsed = generateOccurrencesSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const definition = await findRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    parsed.data.definitionId,
  );
  if (!definition) throw new NotFoundError('Recurrence definition');

  if (definition.status !== 'active') {
    throw new DomainRuleError(
      'Only active recurrences can generate work orders',
      'service.errors.recurrenceNotActive',
    );
  }

  const untilInclusive = resolveHorizon(context, parsed.data);
  // Inclusive cursor: day-before so enumerateOccurrenceDates emits `from` itself.
  const from = businessDate(definition.nextOccurrenceDate ?? definition.startDate);
  const dates = enumerateOccurrenceDates({
    startDate: definition.startDate,
    endDate: definition.endDate,
    frequency: definition.frequency,
    intervalCount: definition.intervalCount,
    untilInclusive,
    afterExclusive: addDays(from, -1),
    maxCount: 120,
  });

  const generated: {
    occurrenceDate: string;
    projectId: string;
    occurrenceId: string;
  }[] = [];
  let skippedExisting = 0;

  await withTransaction(context.db, async (tx) => {
    const txContext: OrgContext = { ...context, db: tx };

    for (const occurrenceDate of dates) {
      const occurrence = await ensurePlannedOccurrence(tx, {
        organizationId: context.organizationId,
        recurrenceDefinitionId: definition.id,
        occurrenceDate,
      });

      if (
        occurrence.status === 'generated' ||
        occurrence.status === 'skipped' ||
        occurrence.status === 'cancelled'
      ) {
        skippedExisting += 1;
        continue;
      }

      const projectId = await createDraftWorkOrderForOccurrence(
        txContext,
        definition,
        occurrenceDate,
      );

      const updated = await updateRecurrenceOccurrenceById(
        tx,
        context.organizationId,
        occurrence.id,
        {
          status: 'generated',
          generatedProjectId: projectId,
          skippedReason: null,
        },
      );

      generated.push({
        occurrenceDate,
        projectId,
        occurrenceId: updated?.id ?? occurrence.id,
      });
    }

    const lastTouched =
      generated[generated.length - 1]?.occurrenceDate ??
      (skippedExisting > 0 && dates.length > 0 ? dates[dates.length - 1]! : null);

    const nextOccurrenceDate = lastTouched
      ? computeNextOccurrenceDate({
          startDate: definition.startDate,
          endDate: definition.endDate,
          frequency: definition.frequency,
          intervalCount: definition.intervalCount,
          onOrAfter: advanceOccurrenceDate(
            businessDate(lastTouched),
            definition.frequency,
            definition.intervalCount,
          ),
        })
      : definition.nextOccurrenceDate;

    await updateRecurrenceDefinitionById(tx, context.organizationId, definition.id, {
      nextOccurrenceDate,
      ...(nextOccurrenceDate === null ? { status: 'ended' as const } : {}),
    });
  });

  if (generated.length > 0) {
    await noteModuleUsage(context.db, context.organizationId, 'service');
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SERVICE_RECURRENCE_GENERATED,
    entityType: 'recurrence_definition',
    entityId: definition.id,
    after: {
      generatedCount: generated.length,
      skippedExisting,
      untilInclusive,
      projectIds: generated.map((g) => g.projectId),
    },
  });

  const refreshed = await findRecurrenceDefinitionById(
    context.db,
    context.organizationId,
    definition.id,
  );

  return {
    definitionId: definition.id,
    generated,
    skippedExisting,
    nextOccurrenceDate: refreshed?.nextOccurrenceDate ?? null,
  };
}

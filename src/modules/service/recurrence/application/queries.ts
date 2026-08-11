import { clients } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type {
  RecurrenceDefinitionListItem,
  RecurrenceDefinitionRecord,
  RecurrenceOccurrenceListItem,
} from '../domain/types';
import {
  countGeneratedOccurrences,
  findRecurrenceDefinitionById,
  listOccurrencesForDefinition,
  listRecurrenceDefinitions,
} from '../data/recurrence.repository';
import {
  listRecurrenceDefinitionsSchema,
  recurrenceDefinitionIdSchema,
  type ListRecurrenceDefinitionsInput,
} from '../validation/schemas';

export async function listRecurrenceDefinitionsForOrg(
  context: OrgContext,
  rawInput: ListRecurrenceDefinitionsInput = {},
): Promise<RecurrenceDefinitionListItem[]> {
  assertPermission(context, PERMISSIONS.SERVICE_READ);

  const parsed = listRecurrenceDefinitionsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listRecurrenceDefinitions(context.db, context.organizationId, {
    status: parsed.data.status,
    search: parsed.data.search,
    includeEnded: parsed.data.includeEnded ?? false,
  });
}

export interface RecurrenceDefinitionDetail {
  readonly definition: RecurrenceDefinitionRecord;
  readonly clientName: string | null;
  readonly occurrences: readonly RecurrenceOccurrenceListItem[];
  readonly generatedCount: number;
}

export async function getRecurrenceDefinitionDetail(
  context: OrgContext,
  rawInput: { definitionId: string },
): Promise<RecurrenceDefinitionDetail> {
  assertPermission(context, PERMISSIONS.SERVICE_READ);

  const parsed = recurrenceDefinitionIdSchema.safeParse(rawInput);
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

  let clientName: string | null = null;
  if (definition.clientId) {
    const [client] = await context.db
      .select({ name: clients.name })
      .from(clients)
      .where(
        and(
          eq(clients.id, definition.clientId),
          eq(clients.organizationId, context.organizationId),
        ),
      )
      .limit(1);
    clientName = client?.name ?? null;
  }

  const [occurrences, generatedCount] = await Promise.all([
    listOccurrencesForDefinition(context.db, context.organizationId, definition.id),
    countGeneratedOccurrences(context.db, context.organizationId, definition.id),
  ]);

  return { definition, clientName, occurrences, generatedCount };
}

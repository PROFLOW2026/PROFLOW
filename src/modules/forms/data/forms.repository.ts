import { and, desc, eq, isNull } from 'drizzle-orm';
import { formSubmissions, formTemplates } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { parseFormTemplateSchema } from '../domain/schema';
import type {
  FormOwnerType,
  FormSubmissionListItem,
  FormSubmissionRecord,
  FormSubmissionStatus,
  FormTemplateRecord,
  FormTemplateSchema,
} from '../domain/types';

function mapTemplate(row: typeof formTemplates.$inferSelect): FormTemplateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    category: row.category,
    schema: parseFormTemplateSchema(row.schemaJson),
    enabled: row.enabled,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSubmission(row: typeof formSubmissions.$inferSelect): FormSubmissionRecord {
  const answers =
    row.answersJson && typeof row.answersJson === 'object' && !Array.isArray(row.answersJson)
      ? (row.answersJson as Record<string, unknown>)
      : null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    templateId: row.templateId,
    ownerType: row.ownerType as FormOwnerType,
    ownerId: row.ownerId,
    status: row.status as FormSubmissionStatus,
    answers,
    acknowledgementName: row.acknowledgementName,
    acknowledgementAt: row.acknowledgementAt,
    acknowledgementNote: row.acknowledgementNote,
    submittedByUserId: row.submittedByUserId,
    submittedByEmployeeId: row.submittedByEmployeeId,
    submittedAt: row.submittedAt,
    offlineClientId: row.offlineClientId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listTemplates(
  db: DbExecutor,
  organizationId: string,
  options: { readonly includeArchived?: boolean; readonly enabledOnly?: boolean } = {},
): Promise<FormTemplateRecord[]> {
  const filters = [eq(formTemplates.organizationId, organizationId)];
  if (!options.includeArchived) filters.push(isNull(formTemplates.archivedAt));
  if (options.enabledOnly) filters.push(eq(formTemplates.enabled, true));

  const rows = await db
    .select()
    .from(formTemplates)
    .where(and(...filters))
    .orderBy(desc(formTemplates.updatedAt))
    .limit(ORG_LIST_HARD_CAP);

  return rows.map(mapTemplate);
}

export async function findTemplateById(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<FormTemplateRecord | null> {
  const [row] = await db
    .select()
    .from(formTemplates)
    .where(
      and(eq(formTemplates.id, templateId), eq(formTemplates.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapTemplate(row) : null;
}

export async function insertTemplate(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly name: string;
    readonly description: string | null;
    readonly category: string | null;
    readonly schema: FormTemplateSchema;
    readonly enabled: boolean;
  },
): Promise<FormTemplateRecord> {
  const [row] = await db
    .insert(formTemplates)
    .values({
      organizationId: values.organizationId,
      name: values.name,
      description: values.description,
      category: values.category,
      schemaJson: values.schema,
      enabled: values.enabled,
    })
    .returning();
  if (!row) throw new Error('Failed to insert form template');
  return mapTemplate(row);
}

export async function updateTemplateById(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
  patch: {
    readonly name?: string;
    readonly description?: string | null;
    readonly category?: string | null;
    readonly schema?: FormTemplateSchema;
    readonly enabled?: boolean;
  },
): Promise<FormTemplateRecord | null> {
  const [row] = await db
    .update(formTemplates)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.schema !== undefined ? { schemaJson: patch.schema } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(formTemplates.id, templateId), eq(formTemplates.organizationId, organizationId)),
    )
    .returning();
  return row ? mapTemplate(row) : null;
}

export async function archiveTemplateById(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<FormTemplateRecord | null> {
  const [row] = await db
    .update(formTemplates)
    .set({ archivedAt: new Date(), enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(formTemplates.id, templateId),
        eq(formTemplates.organizationId, organizationId),
        isNull(formTemplates.archivedAt),
      ),
    )
    .returning();
  return row ? mapTemplate(row) : null;
}

export async function findSubmissionById(
  db: DbExecutor,
  organizationId: string,
  submissionId: string,
): Promise<FormSubmissionRecord | null> {
  const [row] = await db
    .select()
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.id, submissionId),
        eq(formSubmissions.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapSubmission(row) : null;
}

export async function findSubmissionByOfflineClientId(
  db: DbExecutor,
  organizationId: string,
  offlineClientId: string,
): Promise<FormSubmissionRecord | null> {
  const [row] = await db
    .select()
    .from(formSubmissions)
    .where(
      and(
        eq(formSubmissions.organizationId, organizationId),
        eq(formSubmissions.offlineClientId, offlineClientId),
      ),
    )
    .limit(1);
  return row ? mapSubmission(row) : null;
}

export async function listSubmissions(
  db: DbExecutor,
  organizationId: string,
  filters: {
    readonly ownerType?: FormOwnerType;
    readonly ownerId?: string;
    readonly templateId?: string;
    readonly status?: FormSubmissionStatus;
    readonly limit?: number;
    readonly offset?: number;
  } = {},
): Promise<FormSubmissionListItem[]> {
  const where = [eq(formSubmissions.organizationId, organizationId)];
  if (filters.ownerType) where.push(eq(formSubmissions.ownerType, filters.ownerType));
  if (filters.ownerId) where.push(eq(formSubmissions.ownerId, filters.ownerId));
  if (filters.templateId) where.push(eq(formSubmissions.templateId, filters.templateId));
  if (filters.status) where.push(eq(formSubmissions.status, filters.status));

  const rows = await db
    .select({
      submission: formSubmissions,
      templateName: formTemplates.name,
    })
    .from(formSubmissions)
    .innerJoin(
      formTemplates,
      and(
        eq(formTemplates.id, formSubmissions.templateId),
        eq(formTemplates.organizationId, formSubmissions.organizationId),
      ),
    )
    .where(and(...where))
    .orderBy(desc(formSubmissions.updatedAt))
    .limit(
      resolveListLimit(filters.limit, {
        hardCap:
          filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filters.offset));

  return rows.map((row) => ({
    ...mapSubmission(row.submission),
    templateName: row.templateName,
  }));
}

export async function insertSubmission(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly templateId: string;
    readonly ownerType: FormOwnerType;
    readonly ownerId: string;
    readonly status: FormSubmissionStatus;
    readonly answers: Record<string, unknown> | null;
    readonly offlineClientId: string | null;
    readonly submittedByUserId: string | null;
    readonly submittedByEmployeeId: string | null;
  },
): Promise<FormSubmissionRecord> {
  const [row] = await db
    .insert(formSubmissions)
    .values({
      organizationId: values.organizationId,
      templateId: values.templateId,
      ownerType: values.ownerType,
      ownerId: values.ownerId,
      status: values.status,
      answersJson: values.answers,
      offlineClientId: values.offlineClientId,
      submittedByUserId: values.submittedByUserId,
      submittedByEmployeeId: values.submittedByEmployeeId,
    })
    .returning();
  if (!row) throw new Error('Failed to insert form submission');
  return mapSubmission(row);
}

export async function updateSubmissionById(
  db: DbExecutor,
  organizationId: string,
  submissionId: string,
  patch: {
    readonly status?: FormSubmissionStatus;
    readonly answers?: Record<string, unknown> | null;
    readonly acknowledgementName?: string | null;
    readonly acknowledgementAt?: Date | null;
    readonly acknowledgementNote?: string | null;
    readonly submittedByUserId?: string | null;
    readonly submittedByEmployeeId?: string | null;
    readonly submittedAt?: Date | null;
  },
): Promise<FormSubmissionRecord | null> {
  const [row] = await db
    .update(formSubmissions)
    .set({
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.answers !== undefined ? { answersJson: patch.answers } : {}),
      ...(patch.acknowledgementName !== undefined
        ? { acknowledgementName: patch.acknowledgementName }
        : {}),
      ...(patch.acknowledgementAt !== undefined
        ? { acknowledgementAt: patch.acknowledgementAt }
        : {}),
      ...(patch.acknowledgementNote !== undefined
        ? { acknowledgementNote: patch.acknowledgementNote }
        : {}),
      ...(patch.submittedByUserId !== undefined
        ? { submittedByUserId: patch.submittedByUserId }
        : {}),
      ...(patch.submittedByEmployeeId !== undefined
        ? { submittedByEmployeeId: patch.submittedByEmployeeId }
        : {}),
      ...(patch.submittedAt !== undefined ? { submittedAt: patch.submittedAt } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(formSubmissions.id, submissionId),
        eq(formSubmissions.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapSubmission(row) : null;
}

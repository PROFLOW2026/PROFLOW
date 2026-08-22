import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { billingPlanTemplates } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BillingPlanTemplateRecord,
  BillingPlanTemplateRowDefinition,
  BillingPlanWorkKind,
} from '../domain/types';

function parseRowsJson(value: unknown): BillingPlanTemplateRowDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw, index) => {
    const row = raw as Partial<BillingPlanTemplateRowDefinition>;
    return {
      labelKey: String(row.labelKey ?? `row_${index}`),
      labelFallback: row.labelFallback ?? undefined,
      lineKind: (row.lineKind ?? 'manual') as BillingPlanTemplateRowDefinition['lineKind'],
      agreedPercent: row.agreedPercent ?? null,
      agreedAmount: row.agreedAmount ?? null,
      sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : index,
      sectionKey: row.sectionKey ?? null,
      sectionLabelKey: row.sectionLabelKey ?? null,
    };
  });
}

function mapTemplate(row: typeof billingPlanTemplates.$inferSelect): BillingPlanTemplateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    workKind: (row.workKind as BillingPlanWorkKind | null) ?? null,
    defaultRetentionPercent: row.defaultRetentionPercent ?? null,
    currency: row.currency ?? null,
    rowsJson: parseRowsJson(row.rowsJson),
    isSystem: row.isSystem,
    isActive: row.isActive,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findTemplateById(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<BillingPlanTemplateRecord | null> {
  const [row] = await db
    .select()
    .from(billingPlanTemplates)
    .where(
      and(
        eq(billingPlanTemplates.organizationId, organizationId),
        eq(billingPlanTemplates.id, templateId),
      ),
    )
    .limit(1);
  return row ? mapTemplate(row) : null;
}

export async function listActiveTemplates(
  db: DbExecutor,
  organizationId: string,
): Promise<BillingPlanTemplateRecord[]> {
  const rows = await db
    .select()
    .from(billingPlanTemplates)
    .where(
      and(
        eq(billingPlanTemplates.organizationId, organizationId),
        eq(billingPlanTemplates.isActive, true),
        isNull(billingPlanTemplates.archivedAt),
      ),
    )
    .orderBy(asc(billingPlanTemplates.name), desc(billingPlanTemplates.createdAt));
  return rows.map(mapTemplate);
}

export async function insertTemplate(
  db: DbExecutor,
  row: {
    organizationId: string;
    name: string;
    description?: string | null;
    workKind?: BillingPlanWorkKind | null;
    defaultRetentionPercent?: string | null;
    currency?: string | null;
    rowsJson: readonly BillingPlanTemplateRowDefinition[];
    isSystem?: boolean;
    isActive?: boolean;
  },
): Promise<BillingPlanTemplateRecord> {
  const [inserted] = await db
    .insert(billingPlanTemplates)
    .values({
      organizationId: row.organizationId,
      name: row.name,
      description: row.description ?? null,
      workKind: row.workKind ?? null,
      defaultRetentionPercent: row.defaultRetentionPercent ?? null,
      currency: row.currency ?? null,
      rowsJson: row.rowsJson,
      isSystem: row.isSystem ?? false,
      isActive: row.isActive ?? true,
    })
    .returning();
  return mapTemplate(inserted!);
}

export async function archiveTemplate(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<void> {
  await db
    .update(billingPlanTemplates)
    .set({
      isActive: false,
      archivedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(billingPlanTemplates.organizationId, organizationId),
        eq(billingPlanTemplates.id, templateId),
      ),
    );
}

import { and, eq, isNull } from 'drizzle-orm';
import { costCategories } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { CostFamily } from '@/modules/expenses';
import { z } from 'zod';

export interface CostCategoryRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly family: CostFamily;
  readonly isSystem: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
}

const costFamilySchema = z.enum(['direct_project', 'shared', 'business_overhead', 'asset_capital']);

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  family: costFamilySchema,
});

const renameCategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
});

function slugifyKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'category';
}

export async function listCostCategories(context: OrgContext): Promise<CostCategoryRow[]> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  return context.db
    .select({
      id: costCategories.id,
      key: costCategories.key,
      name: costCategories.name,
      family: costCategories.family,
      isSystem: costCategories.isSystem,
      sortOrder: costCategories.sortOrder,
      archivedAt: costCategories.archivedAt,
    })
    .from(costCategories)
    .where(
      and(eq(costCategories.organizationId, context.organizationId), isNull(costCategories.archivedAt)),
    )
    .orderBy(costCategories.family, costCategories.sortOrder, costCategories.name);
}

export async function createCostCategory(context: OrgContext, rawInput: unknown): Promise<CostCategoryRow> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = createCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const keyBase = slugifyKey(input.name);
  let key = keyBase;
  let attempt = 0;

  while (attempt < 5) {
    try {
      const [row] = await context.db
        .insert(costCategories)
        .values({
          organizationId: context.organizationId,
          key,
          name: input.name,
          family: input.family,
          isSystem: false,
          sortOrder: 900 + attempt,
        })
        .returning({
          id: costCategories.id,
          key: costCategories.key,
          name: costCategories.name,
          family: costCategories.family,
          isSystem: costCategories.isSystem,
          sortOrder: costCategories.sortOrder,
          archivedAt: costCategories.archivedAt,
        });

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'cost_category',
        entityId: row!.id,
        after: { key: row!.key, name: row!.name, family: row!.family },
      });

      return row!;
    } catch {
      attempt += 1;
      key = `${keyBase}_${attempt}`;
    }
  }

  throw new ConflictError('Could not create category', 'errors.conflict');
}

export async function renameCostCategory(context: OrgContext, rawInput: unknown): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = renameCategorySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const [existing] = await context.db
    .select({ id: costCategories.id, name: costCategories.name })
    .from(costCategories)
    .where(
      and(
        eq(costCategories.id, parsed.data.categoryId),
        eq(costCategories.organizationId, context.organizationId),
        isNull(costCategories.archivedAt),
      ),
    )
    .limit(1);

  if (!existing) throw new NotFoundError('Cost category');

  await context.db
    .update(costCategories)
    .set({ name: parsed.data.name })
    .where(eq(costCategories.id, parsed.data.categoryId));

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'cost_category',
    entityId: parsed.data.categoryId,
    before: { name: existing.name },
    after: { name: parsed.data.name },
  });
}

export async function archiveCostCategory(context: OrgContext, categoryId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const [existing] = await context.db
    .select({ id: costCategories.id, name: costCategories.name })
    .from(costCategories)
    .where(
      and(
        eq(costCategories.id, categoryId),
        eq(costCategories.organizationId, context.organizationId),
        isNull(costCategories.archivedAt),
      ),
    )
    .limit(1);

  if (!existing) throw new NotFoundError('Cost category');

  await context.db
    .update(costCategories)
    .set({ archivedAt: new Date() })
    .where(eq(costCategories.id, categoryId));

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'cost_category',
    entityId: categoryId,
    before: { archivedAt: null },
    after: { archivedAt: new Date().toISOString() },
  });
}

export const COST_FAMILIES: readonly CostFamily[] = [
  'direct_project',
  'shared',
  'business_overhead',
  'asset_capital',
];

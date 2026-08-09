import { and, eq, isNull } from 'drizzle-orm';
import { costCategories } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { AllocationMethod, CategoryPeriodBehavior, CostFamily } from '@/modules/expenses';
import { CATEGORY_PERIOD_BEHAVIORS } from '@/modules/expenses';
import { z } from 'zod';

export interface CostCategoryRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly family: CostFamily;
  readonly isSystem: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly defaultAllocationMethod: AllocationMethod | null;
  readonly defaultPeriodBehavior: CategoryPeriodBehavior | null;
}

const costFamilySchema = z.enum(['direct_project', 'shared', 'business_overhead', 'asset_capital']);

const allocationMethodSchema = z.enum([
  'manual_amount',
  'manual_percent',
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
]);

const periodBehaviorSchema = z.enum(['one_time', 'monthly', 'date_range']);

const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  family: costFamilySchema,
  defaultAllocationMethod: allocationMethodSchema.nullable().optional(),
  defaultPeriodBehavior: periodBehaviorSchema.nullable().optional(),
});

const renameCategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
});

const setCategoryPolicySchema = z.object({
  categoryId: z.string().uuid(),
  defaultAllocationMethod: allocationMethodSchema.nullable(),
  defaultPeriodBehavior: periodBehaviorSchema.nullable(),
});

/** @deprecated Use setCostCategoryPolicy — kept for call-site compatibility. */
const setDefaultAllocationMethodSchema = z.object({
  categoryId: z.string().uuid(),
  defaultAllocationMethod: allocationMethodSchema.nullable(),
});

function slugifyKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'category';
}

function mapRow(row: {
  id: string;
  key: string;
  name: string;
  family: CostFamily;
  isSystem: boolean;
  sortOrder: number;
  archivedAt: Date | null;
  defaultAllocationMethod: AllocationMethod | null;
  defaultPeriodBehavior: string | null;
}): CostCategoryRow {
  return {
    ...row,
    defaultPeriodBehavior: (row.defaultPeriodBehavior as CategoryPeriodBehavior | null) ?? null,
  };
}

const returningColumns = {
  id: costCategories.id,
  key: costCategories.key,
  name: costCategories.name,
  family: costCategories.family,
  isSystem: costCategories.isSystem,
  sortOrder: costCategories.sortOrder,
  archivedAt: costCategories.archivedAt,
  defaultAllocationMethod: costCategories.defaultAllocationMethod,
  defaultPeriodBehavior: costCategories.defaultPeriodBehavior,
};

export async function listCostCategories(context: OrgContext): Promise<CostCategoryRow[]> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const rows = await context.db
    .select(returningColumns)
    .from(costCategories)
    .where(
      and(eq(costCategories.organizationId, context.organizationId), isNull(costCategories.archivedAt)),
    )
    .orderBy(costCategories.family, costCategories.sortOrder, costCategories.name);

  return rows.map(mapRow);
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
          defaultAllocationMethod: input.defaultAllocationMethod ?? null,
          defaultPeriodBehavior: input.defaultPeriodBehavior ?? null,
        })
        .returning(returningColumns);

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'cost_category',
        entityId: row!.id,
        after: {
          key: row!.key,
          name: row!.name,
          family: row!.family,
          defaultAllocationMethod: row!.defaultAllocationMethod,
          defaultPeriodBehavior: row!.defaultPeriodBehavior,
        },
      });

      return mapRow(row!);
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

export async function setCostCategoryPolicy(context: OrgContext, rawInput: unknown): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = setCategoryPolicySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const [existing] = await context.db
    .select({
      id: costCategories.id,
      defaultAllocationMethod: costCategories.defaultAllocationMethod,
      defaultPeriodBehavior: costCategories.defaultPeriodBehavior,
    })
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
    .set({
      defaultAllocationMethod: parsed.data.defaultAllocationMethod,
      defaultPeriodBehavior: parsed.data.defaultPeriodBehavior,
    })
    .where(eq(costCategories.id, parsed.data.categoryId));

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'cost_category',
    entityId: parsed.data.categoryId,
    before: {
      defaultAllocationMethod: existing.defaultAllocationMethod,
      defaultPeriodBehavior: existing.defaultPeriodBehavior,
    },
    after: {
      defaultAllocationMethod: parsed.data.defaultAllocationMethod,
      defaultPeriodBehavior: parsed.data.defaultPeriodBehavior,
    },
  });
}

export async function setCostCategoryDefaultAllocationMethod(
  context: OrgContext,
  rawInput: unknown,
): Promise<void> {
  const parsed = setDefaultAllocationMethodSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const [existing] = await context.db
    .select({ defaultPeriodBehavior: costCategories.defaultPeriodBehavior })
    .from(costCategories)
    .where(
      and(
        eq(costCategories.id, parsed.data.categoryId),
        eq(costCategories.organizationId, context.organizationId),
        isNull(costCategories.archivedAt),
      ),
    )
    .limit(1);

  await setCostCategoryPolicy(context, {
    categoryId: parsed.data.categoryId,
    defaultAllocationMethod: parsed.data.defaultAllocationMethod,
    defaultPeriodBehavior: (existing?.defaultPeriodBehavior as CategoryPeriodBehavior | null) ?? null,
  });
}

export const COST_FAMILIES: readonly CostFamily[] = [
  'direct_project',
  'shared',
  'business_overhead',
  'asset_capital',
];

export const ALLOCATION_METHODS: readonly AllocationMethod[] = [
  'manual_amount',
  'manual_percent',
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
];

export const PERIOD_BEHAVIORS: readonly CategoryPeriodBehavior[] = CATEGORY_PERIOD_BEHAVIORS;

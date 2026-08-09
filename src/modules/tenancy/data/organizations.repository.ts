import { randomUUID } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  costCategories,
  organizationMemberships,
  organizationModulePreferences,
  organizations,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { OrganizationSummary } from '@/shared/auth/context';
import { DEFAULT_COST_CATEGORIES } from '../domain/organization-defaults';
import type { OrganizationDraft } from '../domain/types';

export interface MembershipRow {
  id: string;
  organizationId: string;
  userId: string;
  status: 'active' | 'invited' | 'suspended';
}

/**
 * Inserts an organization and returns its id, without a `RETURNING` clause.
 *
 * Postgres applies SELECT policies to `INSERT ... RETURNING`, and the select
 * policy on `organizations` requires an active membership — which cannot exist
 * until the row does. Reading the row back is therefore deferred until after
 * the founder's membership is in place, rather than loosening the policy to
 * expose member-less organizations to every authenticated user.
 */
export async function insertOrganization(
  db: DbExecutor,
  draft: OrganizationDraft,
  organizationId: string = randomUUID(),
): Promise<string> {
  await db.insert(organizations).values({
    id: organizationId,
    name: draft.name,
    countryCode: draft.countryCode,
    baseCurrency: draft.baseCurrency,
    timezone: draft.timezone,
    defaultLocale: draft.defaultLocale,
  });

  return organizationId;
}

export async function insertMembership(
  db: DbExecutor,
  input: { organizationId: string; userId: string; status?: 'active' | 'invited' | 'suspended' },
): Promise<MembershipRow> {
  const [row] = await db
    .insert(organizationMemberships)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      status: input.status ?? 'active',
    })
    .returning({
      id: organizationMemberships.id,
      organizationId: organizationMemberships.organizationId,
      userId: organizationMemberships.userId,
      status: organizationMemberships.status,
    });

  return row!;
}

export async function findActiveMembership(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<MembershipRow | null> {
  const [row] = await db
    .select({
      id: organizationMemberships.id,
      organizationId: organizationMemberships.organizationId,
      userId: organizationMemberships.userId,
      status: organizationMemberships.status,
    })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findOrganizationById(
  db: DbExecutor,
  organizationId: string,
): Promise<OrganizationSummary | null> {
  const [row] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      baseCurrency: organizations.baseCurrency,
      timezone: organizations.timezone,
      countryCode: organizations.countryCode,
      defaultLocale: organizations.defaultLocale,
    })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), isNull(organizations.archivedAt)))
    .limit(1);

  return row ?? null;
}

/** Organizations the user can actually act in — used by the org switcher. */
export async function listMembershipsForUser(
  db: DbExecutor,
  userId: string,
): Promise<(OrganizationSummary & { membershipId: string })[]> {
  return db
    .select({
      membershipId: organizationMemberships.id,
      id: organizations.id,
      name: organizations.name,
      baseCurrency: organizations.baseCurrency,
      timezone: organizations.timezone,
      countryCode: organizations.countryCode,
      defaultLocale: organizations.defaultLocale,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(
      and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.status, 'active'),
        isNull(organizations.archivedAt),
      ),
    )
    .orderBy(organizations.name);
}

export async function seedDefaultCostCategories(db: DbExecutor, organizationId: string): Promise<void> {
  await db
    .insert(costCategories)
    .values(
      DEFAULT_COST_CATEGORIES.map((preset) => ({
        organizationId,
        key: preset.key,
        name: preset.name,
        family: preset.family,
        isSystem: true,
        sortOrder: preset.sortOrder,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Marks a module as genuinely used, which is what auto-surfaces it in the
 * navigation (doc 41 §2 option C). Idempotent and safe to call on every write.
 */
export async function markModuleUsed(
  db: DbExecutor,
  organizationId: string,
  moduleKey: string,
): Promise<void> {
  await db
    .insert(organizationModulePreferences)
    .values({ organizationId, moduleKey, enabled: null, firstUsedAt: new Date() })
    .onConflictDoUpdate({
      target: [organizationModulePreferences.organizationId, organizationModulePreferences.moduleKey],
      set: { firstUsedAt: sql`coalesce(${organizationModulePreferences.firstUsedAt}, now())` },
    });
}

export interface ModulePreferenceRow {
  moduleKey: string;
  enabled: boolean | null;
  firstUsedAt: Date | null;
}

export async function listModulePreferences(
  db: DbExecutor,
  organizationId: string,
): Promise<ModulePreferenceRow[]> {
  return db
    .select({
      moduleKey: organizationModulePreferences.moduleKey,
      enabled: organizationModulePreferences.enabled,
      firstUsedAt: organizationModulePreferences.firstUsedAt,
    })
    .from(organizationModulePreferences)
    .where(eq(organizationModulePreferences.organizationId, organizationId));
}

export async function setModulePreference(
  db: DbExecutor,
  organizationId: string,
  moduleKey: string,
  enabled: boolean | null,
): Promise<void> {
  await db
    .insert(organizationModulePreferences)
    .values({ organizationId, moduleKey, enabled })
    .onConflictDoUpdate({
      target: [organizationModulePreferences.organizationId, organizationModulePreferences.moduleKey],
      set: { enabled },
    });
}

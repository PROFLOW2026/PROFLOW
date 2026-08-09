import { eq, sql } from 'drizzle-orm';
import { profiles, userPreferences } from '@drizzle/schema';
import type { AuthenticatedUser } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Bridges Supabase Auth to the application's own user record (doc 73 §2).
 *
 * `profiles.id` is the auth user id — there is no second identity space and no
 * credential material is copied here. Called on first sign-in so the row always
 * exists before anything references it.
 */
export async function ensureProfile(
  db: DbExecutor,
  input: { id: string; email: string; displayName?: string | null; localePreference?: string | null },
): Promise<AuthenticatedUser> {
  const [row] = await db
    .insert(profiles)
    .values({
      id: input.id,
      email: input.email,
      displayName: input.displayName ?? null,
      localePreference: input.localePreference ?? null,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        email: sql`excluded.email`,
        // A display name already chosen in ProjectFlow wins over the auth value.
        displayName: sql`coalesce(${profiles.displayName}, excluded.display_name)`,
      },
    })
    .returning({
      id: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      localePreference: profiles.localePreference,
    });

  return row!;
}

export async function findProfile(db: DbExecutor, userId: string): Promise<AuthenticatedUser | null> {
  const [row] = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      displayName: profiles.displayName,
      localePreference: profiles.localePreference,
    })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);

  return row ?? null;
}

export async function updateProfile(
  db: DbExecutor,
  userId: string,
  input: { displayName?: string | null; localePreference?: string | null },
): Promise<void> {
  await db.update(profiles).set(input).where(eq(profiles.id, userId));
}

/**
 * Remembers the last organization the user worked in. Only a convenience: the
 * server still validates membership before honouring it.
 */
export async function setActiveOrganizationPreference(
  db: DbExecutor,
  userId: string,
  organizationId: string | null,
): Promise<void> {
  await db
    .insert(userPreferences)
    .values({ userId, activeOrganizationId: organizationId })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { activeOrganizationId: organizationId },
    });
}

export async function getActiveOrganizationPreference(
  db: DbExecutor,
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ activeOrganizationId: userPreferences.activeOrganizationId })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  return row?.activeOrganizationId ?? null;
}

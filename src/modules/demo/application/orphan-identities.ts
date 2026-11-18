import 'server-only';

import { eq, inArray, sql } from 'drizzle-orm';
import { demoSessionActors, organizationMemberships } from '@drizzle/schema';
import { withTransaction } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { demoMintedOrganizationId, mayDeleteDemoIdentity } from '../domain/identity-rule';

export type DemoAuthDeletion = 'deleted' | 'missing';

export interface OrphanDemoIdentityPorts {
  /** Deletes the Supabase Auth user; resolves `missing` when it no longer exists. */
  readonly deleteAuthUser: (userId: string) => Promise<DemoAuthDeletion>;
}

export interface OrphanDemoIdentitySweepResult {
  readonly candidates: number;
  readonly authUsersDeleted: number;
  readonly authUsersAlreadyMissing: number;
  readonly profilesDeleted: number;
  /** Auth removed, profile kept because some row still references it. */
  readonly profilesKeptReferenced: number;
  /** Failed a certainty check or an Auth call; nothing was removed for these. */
  readonly skipped: number;
}

type Row = Record<string, unknown>;

function rows(result: unknown): Row[] {
  if (Array.isArray(result)) return result as Row[];
  return ((result as { rows?: Row[] } | null)?.rows ?? []) as Row[];
}

async function profileReferenceColumns(db: DbExecutor): Promise<{ table: string; column: string }[]> {
  const found = rows(
    await db.execute(sql`
      select c.conrelid::regclass::text as table_name, quote_ident(a.attname) as column_name
      from pg_catalog.pg_constraint as c
      join pg_catalog.pg_attribute as a
        on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'public.profiles'::regclass
        and array_length(c.conkey, 1) = 1
    `),
  );
  return found.map((row) => ({ table: String(row.table_name), column: String(row.column_name) }));
}

async function profileIsReferenced(
  db: DbExecutor,
  columns: readonly { table: string; column: string }[],
  profileId: string,
): Promise<boolean> {
  if (columns.length === 0) return false;
  const probes = columns.map(
    (ref) => sql`exists (select 1 from ${sql.raw(ref.table)} where ${sql.raw(ref.column)} = ${profileId}::uuid)`,
  );
  const [row] = rows(await db.execute(sql`select (${sql.join(probes, sql` or `)}) as referenced`));
  return row?.referenced === true;
}

/**
 * Removes demo actor identities whose session organization no longer exists. An identity is
 * touched only when its email is an exact demo actor address minted for that organization,
 * it has no membership and is not a live session actor. The profile row is removed only when
 * no table references it; otherwise only the Auth login is removed.
 */
export async function sweepOrphanDemoIdentities(
  db: DbExecutor,
  ports: OrphanDemoIdentityPorts,
  options?: { readonly limit?: number },
): Promise<OrphanDemoIdentitySweepResult> {
  const limit = options?.limit ?? 200;
  const candidates = rows(
    await db.execute(sql`
      select p.id, lower(p.email) as email
      from profiles as p
      where (
          lower(p.email) like '%@demo.pf.internal'
          or lower(p.email) like 'demo.%@employees.pf.internal'
          or lower(p.email) like 'demo.%@contractors.pf.internal'
        )
        and not exists (select 1 from organization_memberships as m where m.user_id = p.id)
        and not exists (select 1 from demo_session_actors as a where a.auth_user_id = p.id)
      order by p.created_at
      limit ${limit}
    `),
  );

  let authUsersDeleted = 0;
  let authUsersAlreadyMissing = 0;
  let profilesDeleted = 0;
  let profilesKeptReferenced = 0;
  let skipped = 0;
  let columns: { table: string; column: string }[] | null = null;

  for (const candidate of candidates) {
    const profileId = String(candidate.id);
    const email = String(candidate.email);
    const mintedFor = demoMintedOrganizationId(email);
    if (!mintedFor) {
      skipped += 1;
      continue;
    }
    const orgStillExists = rows(
      await db.execute(sql`select 1 from organizations where id = ${mintedFor}::uuid`),
    ).length > 0;
    if (orgStillExists) {
      skipped += 1;
      continue;
    }

    let deletion: DemoAuthDeletion;
    try {
      deletion = await ports.deleteAuthUser(profileId);
    } catch (error) {
      console.error('orphan demo identity auth delete failed', { profileId, error });
      skipped += 1;
      continue;
    }
    if (deletion === 'deleted') authUsersDeleted += 1;
    else authUsersAlreadyMissing += 1;

    columns ??= await profileReferenceColumns(db);
    if (await profileIsReferenced(db, columns, profileId)) {
      profilesKeptReferenced += 1;
      continue;
    }
    try {
      const removed = await withTransaction(db, (savepoint) =>
        savepoint.execute(sql`
          delete from profiles
          where id = ${profileId}::uuid and lower(email) = ${email}
          returning id
        `),
      );
      if (rows(removed).length > 0) profilesDeleted += 1;
    } catch (error) {
      console.error('orphan demo identity profile delete failed', { profileId, error });
      profilesKeptReferenced += 1;
    }
  }

  return {
    candidates: candidates.length,
    authUsersDeleted,
    authUsersAlreadyMissing,
    profilesDeleted,
    profilesKeptReferenced,
    skipped,
  };
}

export interface DemoSessionActorIdentity {
  readonly authUserId: string;
  readonly email: string;
}

export async function loadDemoSessionActorIdentities(
  db: DbExecutor,
  sessionOrganizationId: string,
): Promise<DemoSessionActorIdentity[]> {
  return db
    .select({ authUserId: demoSessionActors.authUserId, email: demoSessionActors.email })
    .from(demoSessionActors)
    .where(eq(demoSessionActors.organizationId, sessionOrganizationId));
}

/**
 * After a previous demo session org was removed, delete its actor logins. Only addresses minted
 * for that exact session, with no membership left outside it, are deleted.
 */
export async function deleteRemovedSessionActorLogins(
  db: DbExecutor,
  deleteAuthUser: (userId: string) => Promise<unknown>,
  sessionOrganizationId: string,
  actors: readonly DemoSessionActorIdentity[],
): Promise<number> {
  let deleted = 0;
  const deleting = new Set([sessionOrganizationId]);
  const eligible = actors.filter(
    (actor) => demoMintedOrganizationId(actor.email) === sessionOrganizationId,
  );
  if (eligible.length === 0) return 0;
  const memberships = await db
    .select({
      userId: organizationMemberships.userId,
      organizationId: organizationMemberships.organizationId,
    })
    .from(organizationMemberships)
    .where(inArray(organizationMemberships.userId, eligible.map((actor) => actor.authUserId)));
  for (const actor of eligible) {
    const membershipOrganizationIds = memberships
      .filter((row) => row.userId === actor.authUserId)
      .map((row) => row.organizationId);
    if (
      !mayDeleteDemoIdentity({
        email: actor.email,
        membershipOrganizationIds,
        deletingOrganizationIds: deleting,
      })
    ) {
      continue;
    }
    try {
      await deleteAuthUser(actor.authUserId);
      deleted += 1;
    } catch (error) {
      console.error('demo previous session login delete failed', { userId: actor.authUserId, error });
    }
  }
  return deleted;
}

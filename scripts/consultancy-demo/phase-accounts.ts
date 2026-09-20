import {
  CONSULTANCY_DEMO_ORG_ID,
  CONSULTANCY_ORG_NAME,
  CONTRACTOR_DEMO_ORG_ID,
  CONTRACTOR_DEMO_ORG_NAME,
  EXCLUDED_ORG_NAME,
  PRIMARY_USER_EMAIL,
  SECONDARY_USER_EMAIL,
} from './constants.ts';
import type { Sql } from 'postgres';

import type { SeedStats } from './context.ts';

const ALLOWED_ORG_IDS = new Set([CONSULTANCY_DEMO_ORG_ID, CONTRACTOR_DEMO_ORG_ID]);

export interface AccountSetupResult {
  primaryUserId: string;
  primaryUserEmail: string;
  secondaryUserId: string;
  secondaryUserEmail: string;
  leokidExperimentalOrgsSuspended: string[];
  leokidRemovedFromRealOrg: boolean;
}

async function bootstrapSql<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function ensureOwnerMembershipBootstrap(
  sql: Sql,
  organizationId: string,
  userId: string,
  stats: SeedStats,
): Promise<void> {
  const [existing] = await sql<{ id: string; status: string }[]>`
    select id, status from organization_memberships
    where organization_id = ${organizationId}::uuid and user_id = ${userId}::uuid
    limit 1`;

  let membershipId = existing?.id;
  if (!existing) {
    const [inserted] = await sql<{ id: string }[]>`
      insert into organization_memberships (organization_id, user_id, status)
      values (${organizationId}::uuid, ${userId}::uuid, 'active')
      returning id`;
    membershipId = inserted?.id;
    stats.notes.push(`Bootstrap membership user=${userId} org=${organizationId}`);
  } else if (existing.status !== 'active') {
    await sql`
      update organization_memberships set status = 'active', updated_at = now()
      where id = ${existing.id}::uuid`;
  }

  const [ownerRole] = await sql<{ id: string }[]>`
    select id from roles where organization_id = ${organizationId}::uuid and key = 'owner' limit 1`;
  if (!ownerRole || !membershipId) throw new Error(`Owner role/membership missing for ${organizationId}`);

  await sql`
    insert into role_assignments (organization_id, membership_id, user_id, role_id)
    values (${organizationId}::uuid, ${membershipId}::uuid, ${userId}::uuid, ${ownerRole.id}::uuid)
    on conflict do nothing`;
}

export async function setupConsultancyAccounts(
  stats: SeedStats,
  _actorUserId: string,
): Promise<AccountSetupResult> {
  const { resolveUserByEmail } = await import('./context.ts');

  const primary = await resolveUserByEmail(PRIMARY_USER_EMAIL);
  const secondary = await resolveUserByEmail(SECONDARY_USER_EMAIL);

  const result: AccountSetupResult = {
    primaryUserId: primary.userId,
    primaryUserEmail: primary.userEmail,
    secondaryUserId: secondary.userId,
    secondaryUserEmail: secondary.userEmail,
    leokidExperimentalOrgsSuspended: [],
    leokidRemovedFromRealOrg: false,
  };

  await bootstrapSql(async (sql) => {
    await ensureOwnerMembershipBootstrap(sql, CONSULTANCY_DEMO_ORG_ID, primary.userId, stats);
    await ensureOwnerMembershipBootstrap(sql, CONSULTANCY_DEMO_ORG_ID, secondary.userId, stats);
    await ensureOwnerMembershipBootstrap(sql, CONTRACTOR_DEMO_ORG_ID, secondary.userId, stats);

    await sql`
      insert into user_preferences (user_id, active_organization_id)
      values (${primary.userId}::uuid, ${CONSULTANCY_DEMO_ORG_ID}::uuid)
      on conflict (user_id) do update
      set active_organization_id = excluded.active_organization_id, updated_at = now()`;

    const leokidMemberships = await sql<
      { membership_id: string; org_id: string; org_name: string; status: string }[]
    >`
      select om.id as membership_id, o.id as org_id, o.name as org_name, om.status
      from organization_memberships om
      join organizations o on o.id = om.organization_id
      where om.user_id = ${primary.userId}::uuid`;

    for (const row of leokidMemberships) {
      if (row.org_name === EXCLUDED_ORG_NAME) {
        await sql`update organization_memberships set status = 'suspended', updated_at = now() where id = ${row.membership_id}::uuid`;
        result.leokidRemovedFromRealOrg = true;
        stats.notes.push(`Suspended leokid on real org (${EXCLUDED_ORG_NAME})`);
        continue;
      }
      if (ALLOWED_ORG_IDS.has(row.org_id)) continue;
      if (row.status === 'active') {
        await sql`update organization_memberships set status = 'suspended', updated_at = now() where id = ${row.membership_id}::uuid`;
        result.leokidExperimentalOrgsSuspended.push(row.org_name);
        stats.notes.push(`Suspended leokid experimental org: ${row.org_name}`);
      }
    }
  });

  stats.notes.push(
    `Primary owner ${PRIMARY_USER_EMAIL} on ${CONSULTANCY_ORG_NAME}; secondary ${SECONDARY_USER_EMAIL} on consultancy + ${CONTRACTOR_DEMO_ORG_NAME}`,
  );

  return result;
}

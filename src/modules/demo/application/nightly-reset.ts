import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { demoResetItems, demoResetRuns, demoSessionActors, demoSessions, organizations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { withTransaction } from '@/shared/db/client';
import {
  decideResetAction,
  resetRunIsComplete,
  type ResetStatus,
} from '../domain/reset-decision';
import { isJerusalemResetHour, jerusalemDateKey } from '../domain/reset-clock';
import { mayDeleteDemoIdentity } from '../domain/identity-rule';
import { deleteDemoSessionOrganization } from './delete-session';
import { deleteDemoSessionOrganizationSucceeded } from '../domain/session-cleanup';

const LEASE_MS = 15 * 60 * 1000;

export interface DemoResetPorts {
  readonly deleteStoragePrefix: (prefix: string) => Promise<void>;
  readonly deleteAuthUser: (userId: string) => Promise<void>;
  readonly profileEmail: (profileId: string) => Promise<string | null>;
  readonly membershipOrganizationIds: (profileId: string) => Promise<readonly string[]>;
}

export interface NightlyResetResult {
  readonly status: ResetStatus | 'skipped';
  readonly jerusalemDate: string;
}

async function enqueueSessionResetItems(
  db: DbExecutor,
  jerusalemDate: string,
  sessions: readonly { readonly id: string }[],
): Promise<void> {
  for (const session of sessions) {
    const actors = await db
      .select({ authUserId: demoSessionActors.authUserId })
      .from(demoSessionActors)
      .where(eq(demoSessionActors.organizationId, session.id));
    const ids = actors.map((actor) => actor.authUserId);
    for (const phase of ['rows', 'storage', 'auth'] as const) {
      await db.insert(demoResetItems).values({
        jerusalemDate,
        organizationId: session.id,
        phase,
        status: 'pending',
        storagePrefix: `${session.id}/`,
        authUserIds: ids,
        profileIds: ids,
      });
    }
  }
}

async function loadRun(db: DbExecutor, jerusalemDate: string) {
  const [row] = await db
    .select()
    .from(demoResetRuns)
    .where(eq(demoResetRuns.jerusalemDate, jerusalemDate))
    .limit(1);
  return row ?? null;
}

export interface NightlyResetOptions {
  readonly failPhase?: 'rows' | 'storage' | 'auth';
  /**
   * When false (default), abandoned session orgs are not enqueued. Production cron
   * must leave this unset until Owner explicitly enables sweeper cleanup.
   */
  readonly includeAbandonedSessionOrgs?: boolean;
}

export async function runNightlyReset(
  db: DbExecutor,
  ports: DemoResetPorts,
  now: Date = new Date(),
  options?: NightlyResetOptions,
): Promise<NightlyResetResult> {
  const jerusalemDate = jerusalemDateKey(now);
  const existing = await loadRun(db, jerusalemDate);
  const decision = decideResetAction({
    existing: existing
      ? { status: existing.status as ResetStatus, leaseUntil: existing.leaseUntil }
      : null,
    now,
    resetHour: isJerusalemResetHour(now),
  });
  if (decision === 'skip' || decision === 'exit') {
    return { status: decision === 'exit' ? 'completed' : 'skipped', jerusalemDate };
  }

  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  if (decision === 'create') {
    await db.insert(demoResetRuns).values({
      jerusalemDate,
      status: 'pending',
      leaseUntil,
      lastError: null,
    });
  }
  await db
    .update(demoResetRuns)
    .set({ status: 'running', leaseUntil, lastError: null })
    .where(eq(demoResetRuns.jerusalemDate, jerusalemDate));

  if (decision === 'create') {
    const sessions = await db
      .select({ id: organizations.id })
      .from(organizations)
      .innerJoin(demoSessions, eq(demoSessions.organizationId, organizations.id))
      .where(eq(organizations.demoKind, 'session'));
    await enqueueSessionResetItems(db, jerusalemDate, sessions);

    if (options?.includeAbandonedSessionOrgs) {
      const abandoned = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.demoKind, 'session'),
            sql`${organizations.demoAbandonedAt} is not null`,
            sql`not exists (
              select 1 from demo_sessions as session_row
              where session_row.organization_id = ${organizations.id}
            )`,
          ),
        );
      for (const row of abandoned) {
        for (const phase of ['rows', 'storage', 'auth'] as const) {
          await db.insert(demoResetItems).values({
            jerusalemDate,
            organizationId: row.id,
            phase,
            status: 'pending',
            storagePrefix: `${row.id}/`,
            authUserIds: [],
            profileIds: [],
          });
        }
      }
    }
  }

  const items = await db
    .select()
    .from(demoResetItems)
    .where(eq(demoResetItems.jerusalemDate, jerusalemDate));

  let failed = false;
  const rowsCompleted = new Set(
    items.filter((row) => row.phase === 'rows' && row.status === 'completed').map((row) => row.organizationId),
  );
  const phaseOrder: Record<string, number> = { rows: 0, storage: 1, auth: 2 };
  const ordered = [...items].sort(
    (left, right) => (phaseOrder[left.phase] ?? 9) - (phaseOrder[right.phase] ?? 9),
  );
  for (const item of ordered) {
    if (item.status === 'completed') continue;
    if (item.phase !== 'rows' && !rowsCompleted.has(item.organizationId)) {
      continue;
    }
    try {
      if (item.phase === 'rows') {
        if (options?.failPhase === 'rows') throw new Error('injected rows failure');
        const deleted = await withTransaction(db, (tx) =>
          deleteDemoSessionOrganization(tx, item.organizationId),
        );
        if (!deleteDemoSessionOrganizationSucceeded(deleted)) {
          throw new Error(
            deleted.softAbandoned
              ? 'session delete soft-abandoned only; organization row remains'
              : 'session delete did not remove the organization',
          );
        }
        rowsCompleted.add(item.organizationId);
      } else if (item.phase === 'storage') {
        if (options?.failPhase === 'storage') throw new Error('injected storage failure');
        if (!item.storagePrefix) throw new Error('missing storage prefix');
        await ports.deleteStoragePrefix(item.storagePrefix);
      } else if (item.phase === 'auth') {
        if (options?.failPhase === 'auth') throw new Error('injected auth failure');
        const ids = item.authUserIds ?? [];
        if (ids.length === 0) {
          const rowsAlreadyRemoved = rowsCompleted.has(item.organizationId);
          if (!rowsAlreadyRemoved) {
            const [org] = await db
              .select({
                demoAbandonedAt: organizations.demoAbandonedAt,
              })
              .from(organizations)
              .where(eq(organizations.id, item.organizationId))
              .limit(1);
            const hasSession = await db
              .select({ organizationId: demoSessions.organizationId })
              .from(demoSessions)
              .where(eq(demoSessions.organizationId, item.organizationId))
              .limit(1);
            const abandonedOnly =
              org?.demoAbandonedAt != null && hasSession.length === 0;
            if (!abandonedOnly) throw new Error('missing saved auth user ids');
          }
        } else {
        const deleting = new Set(
          items.filter((row) => row.phase === 'rows').map((row) => row.organizationId),
        );
        for (const profileId of ids) {
          const email = await ports.profileEmail(profileId);
          const memberships = await ports.membershipOrganizationIds(profileId);
          if (!email || !mayDeleteDemoIdentity({
            email,
            membershipOrganizationIds: memberships,
            deletingOrganizationIds: deleting,
          })) {
            continue;
          }
          await ports.deleteAuthUser(profileId);
        }
        }
      }
      await db
        .update(demoResetItems)
        .set({ status: 'completed', lastError: null })
        .where(
          and(
            eq(demoResetItems.jerusalemDate, jerusalemDate),
            eq(demoResetItems.organizationId, item.organizationId),
            eq(demoResetItems.phase, item.phase),
          ),
        );
    } catch (error) {
      failed = true;
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
      const message = (cause || (error instanceof Error ? error.message : "reset item failed")).slice(0, 500);
      await db
        .update(demoResetItems)
        .set({ status: 'failed', lastError: message })
        .where(
          and(
            eq(demoResetItems.jerusalemDate, jerusalemDate),
            eq(demoResetItems.organizationId, item.organizationId),
            eq(demoResetItems.phase, item.phase),
          ),
        );
    }
  }

  const refreshed = await db
    .select({ status: demoResetItems.status })
    .from(demoResetItems)
    .where(eq(demoResetItems.jerusalemDate, jerusalemDate));
  const statuses = refreshed.map((row) => row.status as ResetStatus);
  const completed = !failed && statuses.length > 0 && resetRunIsComplete(statuses);
  const zeroSessions = statuses.length === 0;
  const status: ResetStatus = completed || zeroSessions ? 'completed' : 'failed';
  if (zeroSessions && decision === 'create') {
    await db
      .update(demoResetRuns)
      .set({ status: 'completed', lastError: null })
      .where(eq(demoResetRuns.jerusalemDate, jerusalemDate));
    return { status: 'completed', jerusalemDate };
  }
  await db
    .update(demoResetRuns)
    .set({ status, lastError: failed ? 'one or more items failed' : null })
    .where(eq(demoResetRuns.jerusalemDate, jerusalemDate));
  return { status, jerusalemDate };
}

export async function countSessionOrganizations(db: DbExecutor): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizations)
    .innerJoin(demoSessions, eq(demoSessions.organizationId, organizations.id))
    .where(eq(organizations.demoKind, 'session'));
  return Number(row?.count ?? 0);
}

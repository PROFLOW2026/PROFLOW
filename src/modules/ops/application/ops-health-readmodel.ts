import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  crossOrgSyncOutbox,
  documents,
  domainEvents,
  organizationStorageConnections,
} from '@drizzle/schema';
import { countLegacyDocuments } from '@/modules/documents/application/legacy-document-count';
import { countDeadLetteredDomainEvents } from '@/modules/dg-events';
import { DG_MAX_ATTEMPTS } from '@/modules/dg-events/domain/backoff';
import { getAdminDb } from '@/shared/db/client';
import { workerSecretsConfigured } from '@/shared/env/server';

const COUNT_LIMIT = 500;

export interface OpsHealthSnapshot {
  readonly workerSecretsConfigured: boolean;
  readonly dgDeadLetter: { readonly count: number; readonly oldestOccurredAt: string | null };
  readonly crossOrgOutbox: Readonly<Record<string, number>>;
  readonly storageConnections: Readonly<Record<string, number>>;
  readonly documentCleanupCandidates: number;
  readonly legacyDocuments: number;
}

function rowsToCountMap(rows: { status: string | null; count: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.status) out[row.status] = Number(row.count ?? 0);
  }
  return out;
}

export async function loadOpsHealthSnapshot(): Promise<OpsHealthSnapshot> {
  const db = getAdminDb();

  const [oldestDeadLetter] = await db
    .select({ occurredAt: domainEvents.occurredAt })
    .from(domainEvents)
    .where(and(isNull(domainEvents.processedAt), sql`${domainEvents.attempts} >= ${DG_MAX_ATTEMPTS}`))
    .orderBy(domainEvents.occurredAt)
    .limit(1);

  const [cleanupRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(
      and(
        eq(documents.status, 'deleted'),
        sql`${documents.storageCleanupStatus} in ('failed', 'pending')`,
      ),
    )
    .limit(COUNT_LIMIT);

  const outboxRows = await db
    .select({
      status: crossOrgSyncOutbox.status,
      count: sql<number>`count(*)::int`,
    })
    .from(crossOrgSyncOutbox)
    .groupBy(crossOrgSyncOutbox.status)
    .limit(COUNT_LIMIT);

  const storageRows = await db
    .select({
      status: organizationStorageConnections.status,
      count: sql<number>`count(*)::int`,
    })
    .from(organizationStorageConnections)
    .groupBy(organizationStorageConnections.status)
    .limit(COUNT_LIMIT);

  return {
    workerSecretsConfigured: workerSecretsConfigured(),
    dgDeadLetter: {
      count: await countDeadLetteredDomainEvents(db),
      oldestOccurredAt: oldestDeadLetter?.occurredAt?.toISOString() ?? null,
    },
    crossOrgOutbox: rowsToCountMap(outboxRows),
    storageConnections: rowsToCountMap(storageRows),
    documentCleanupCandidates: Number(cleanupRow?.count ?? 0),
    legacyDocuments: await countLegacyDocuments(db),
  };
}

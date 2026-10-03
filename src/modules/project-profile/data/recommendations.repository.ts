import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { projectMilestones, projectRecommendationDecisions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  RecommendationDecisionRef,
  RecommendationKind,
  RecommendationTarget,
} from '../domain/recommendations';

export interface StoredDecision extends RecommendationDecisionRef {
  readonly id: string;
  readonly kind: RecommendationKind;
  readonly decidedUserId: string | null;
  readonly decidedAt: Date;
}

export async function listRecommendationDecisions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<StoredDecision[]> {
  const rows = await db
    .select()
    .from(projectRecommendationDecisions)
    .where(
      and(
        eq(projectRecommendationDecisions.organizationId, organizationId),
        eq(projectRecommendationDecisions.projectId, projectId),
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    recommendationKey: row.recommendationKey,
    kind: row.kind,
    decision: row.decision,
    createdEntityType: (row.createdEntityType ?? null) as RecommendationTarget | null,
    createdEntityId: row.createdEntityId,
    decidedUserId: row.decidedUserId,
    decidedAt: row.decidedAt,
  }));
}

export async function insertRecommendationDecisions(
  db: DbExecutor,
  rows: readonly {
    id: string;
    organizationId: string;
    projectId: string;
    recommendationKey: string;
    kind: RecommendationKind;
    decision: 'accepted' | 'dismissed';
    rulesetVersion: string;
    createdEntityType: RecommendationTarget | null;
    createdEntityId: string | null;
    decidedUserId: string;
  }[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(projectRecommendationDecisions).values(
    rows.map((row) => ({ ...row, decidedActorType: 'internal' as const })),
  );
}

/** Deletes dismissed decisions only (accepted are protected by trigger + RLS). */
export async function deleteDismissedDecisions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  keys: readonly string[],
): Promise<string[]> {
  if (keys.length === 0) return [];
  const rows = await db
    .delete(projectRecommendationDecisions)
    .where(
      and(
        eq(projectRecommendationDecisions.organizationId, organizationId),
        eq(projectRecommendationDecisions.projectId, projectId),
        eq(projectRecommendationDecisions.decision, 'dismissed'),
        inArray(projectRecommendationDecisions.recommendationKey, [...keys]),
      ),
    )
    .returning({ key: projectRecommendationDecisions.recommendationKey });
  return rows.map((row) => row.key);
}

/**
 * Milestone row for an accepted recommendation. Same columns/defaults as the projects module
 * milestone insert (status planned, hidden from the customer portal).
 */
export async function insertRecommendedMilestones(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  names: readonly string[],
): Promise<string[]> {
  if (names.length === 0) return [];
  const [last] = await db
    .select({ max: sql<number | null>`max(${projectMilestones.sortOrder})` })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.organizationId, organizationId),
        eq(projectMilestones.projectId, projectId),
        isNull(projectMilestones.archivedAt),
      ),
    );
  const start = Number(last?.max ?? -1) + 1;
  const rows = await db
    .insert(projectMilestones)
    .values(
      names.map((name, index) => ({
        organizationId,
        projectId,
        name,
        status: 'planned',
        sortOrder: start + index,
      })),
    )
    .returning({ id: projectMilestones.id });
  return rows.map((row) => row.id);
}

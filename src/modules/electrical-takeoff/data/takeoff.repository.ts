import { and, desc, eq, max, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import {
  takeoffAnalyses,
  takeoffApprovals,
  takeoffAreas,
  takeoffArtifacts,
  takeoffCatalogTypes,
  takeoffDetections,
  takeoffEdits,
  takeoffFiles,
  takeoffJobs,
  takeoffPlannerSymbolLibrary,
  takeoffRuleSets,
  takeoffSheets,
  takeoffWarnings,
} from '@drizzle/schema';
import type { TakeoffEdit, WorkerDetection, WorkerResult, WorkerSheet } from '../domain/contracts';
import { collectWorkerWarningsFromResult, warningRowPayload } from '../domain/worker-warnings';

export const TAKEOFF_CHUNK_BYTES = 4 * 1024 * 1024;
export const TAKEOFF_MAX_FILE_BYTES = 250 * 1024 * 1024;

export async function listAnalysesForProject(db: DbExecutor, organizationId: string, projectId: string) {
  return db
    .select()
    .from(takeoffAnalyses)
    .where(and(eq(takeoffAnalyses.organizationId, organizationId), eq(takeoffAnalyses.projectId, projectId)))
    .orderBy(desc(takeoffAnalyses.updatedAt));
}

export async function insertAnalysis(
  db: DbExecutor,
  row: typeof takeoffAnalyses.$inferInsert,
): Promise<typeof takeoffAnalyses.$inferSelect> {
  const [created] = await db.insert(takeoffAnalyses).values(row).returning();
  if (!created) throw new Error('insertAnalysis failed');
  return created;
}

export async function findAnalysis(
  db: DbExecutor,
  organizationId: string,
  analysisId: string,
): Promise<typeof takeoffAnalyses.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(takeoffAnalyses)
    .where(and(eq(takeoffAnalyses.organizationId, organizationId), eq(takeoffAnalyses.id, analysisId)))
    .limit(1);
  return row ?? null;
}

export async function deleteAnalysis(db: DbExecutor, organizationId: string, analysisId: string): Promise<void> {
  await db
    .delete(takeoffAnalyses)
    .where(and(eq(takeoffAnalyses.organizationId, organizationId), eq(takeoffAnalyses.id, analysisId)));
}

export async function bumpAnalysisRevision(
  db: DbExecutor,
  organizationId: string,
  analysisId: string,
  expectedRevision: number,
): Promise<number | null> {
  const [row] = await db
    .update(takeoffAnalyses)
    .set({ revision: expectedRevision + 1, updatedAt: new Date() })
    .where(
      and(
        eq(takeoffAnalyses.organizationId, organizationId),
        eq(takeoffAnalyses.id, analysisId),
        eq(takeoffAnalyses.revision, expectedRevision),
      ),
    )
    .returning({ revision: takeoffAnalyses.revision });
  return row?.revision ?? null;
}

export async function listFilesForAnalysis(db: DbExecutor, organizationId: string, analysisId: string) {
  return db
    .select()
    .from(takeoffFiles)
    .where(and(eq(takeoffFiles.organizationId, organizationId), eq(takeoffFiles.analysisId, analysisId)));
}

export async function insertFile(db: DbExecutor, row: typeof takeoffFiles.$inferInsert) {
  const [created] = await db.insert(takeoffFiles).values(row).returning();
  if (!created) throw new Error('insertFile failed');
  return created;
}

export async function findFile(db: DbExecutor, organizationId: string, fileId: string) {
  const [row] = await db
    .select()
    .from(takeoffFiles)
    .where(and(eq(takeoffFiles.organizationId, organizationId), eq(takeoffFiles.id, fileId)))
    .limit(1);
  return row ?? null;
}

export async function updateFileUpload(
  db: DbExecutor,
  organizationId: string,
  fileId: string,
  patch: Partial<typeof takeoffFiles.$inferInsert>,
) {
  await db
    .update(takeoffFiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(takeoffFiles.organizationId, organizationId), eq(takeoffFiles.id, fileId)));
}

export async function insertJob(db: DbExecutor, row: typeof takeoffJobs.$inferInsert) {
  const [created] = await db.insert(takeoffJobs).values(row).returning();
  if (!created) throw new Error('insertJob failed');
  return created;
}

export async function findJob(db: DbExecutor, organizationId: string, jobId: string) {
  const where = organizationId
    ? and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId))
    : eq(takeoffJobs.id, jobId);
  const [row] = await db.select().from(takeoffJobs).where(where).limit(1);
  return row ?? null;
}

export async function latestSuccessfulJob(db: DbExecutor, organizationId: string, analysisId: string) {
  const [row] = await db
    .select()
    .from(takeoffJobs)
    .where(
      and(
        eq(takeoffJobs.organizationId, organizationId),
        eq(takeoffJobs.analysisId, analysisId),
        sql`${takeoffJobs.status} IN ('succeeded', 'partial')`,
      ),
    )
    .orderBy(desc(takeoffJobs.finishedAt))
    .limit(1);
  return row ?? null;
}

export async function listEdits(db: DbExecutor, organizationId: string, analysisId: string) {
  return db
    .select()
    .from(takeoffEdits)
    .where(and(eq(takeoffEdits.organizationId, organizationId), eq(takeoffEdits.analysisId, analysisId)))
    .orderBy(takeoffEdits.seq);
}

export async function nextEditSeq(db: DbExecutor, analysisId: string): Promise<number> {
  const [row] = await db
    .select({ m: max(takeoffEdits.seq) })
    .from(takeoffEdits)
    .where(eq(takeoffEdits.analysisId, analysisId));
  return (row?.m ?? 0) + 1;
}

export async function appendEdits(db: DbExecutor, rows: (typeof takeoffEdits.$inferInsert)[]) {
  if (rows.length === 0) return;
  await db.insert(takeoffEdits).values(rows);
}

export async function listDetectionsForJob(db: DbExecutor, organizationId: string, jobId: string): Promise<WorkerDetection[]> {
  const rows = await db
    .select()
    .from(takeoffDetections)
    .where(and(eq(takeoffDetections.organizationId, organizationId), eq(takeoffDetections.jobId, jobId)));
  return rows.map((r) => r.payload as unknown as WorkerDetection);
}

export async function listSheetsForJob(db: DbExecutor, organizationId: string, jobId: string): Promise<WorkerSheet[]> {
  const rows = await db
    .select()
    .from(takeoffSheets)
    .where(and(eq(takeoffSheets.organizationId, organizationId), eq(takeoffSheets.jobId, jobId)));
  return rows.map((r) => r.payload as unknown as WorkerSheet);
}

export async function listWarningsForJob(db: DbExecutor, organizationId: string, jobId: string) {
  return db
    .select()
    .from(takeoffWarnings)
    .where(and(eq(takeoffWarnings.organizationId, organizationId), eq(takeoffWarnings.jobId, jobId)))
    .orderBy(takeoffWarnings.createdAt);
}

export async function listAreas(db: DbExecutor, organizationId: string, analysisId: string) {
  return db
    .select()
    .from(takeoffAreas)
    .where(and(eq(takeoffAreas.organizationId, organizationId), eq(takeoffAreas.analysisId, analysisId)));
}

export async function ingestWorkerResult(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  analysisId: string,
  jobId: string,
  result: WorkerResult,
): Promise<{ alreadyIngested: boolean }> {
  const [job] = await db
    .select({ ingested: takeoffJobs.resultIngestedAt })
    .from(takeoffJobs)
    .where(and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId)))
    .limit(1);
  if (job?.ingested) return { alreadyIngested: true };

  await db.transaction(async (tx) => {
    await tx.execute(sql`set local role service_role`);
    const [again] = await tx
      .select({ ingested: takeoffJobs.resultIngestedAt })
      .from(takeoffJobs)
      .where(and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId)))
      .limit(1);
    if (again?.ingested) return;

    if (result.sheets.length > 0) {
      await tx.insert(takeoffSheets).values(
        result.sheets.map((s) => ({
          organizationId,
          projectId,
          jobId,
          analysisId,
          sheetKey: s.sheetKey,
          fileId: s.fileId,
          payload: s as unknown as Record<string, unknown>,
        })),
      );
    }
    if (result.detections.length > 0) {
      await tx.insert(takeoffDetections).values(
        result.detections.map((d) => ({
          organizationId,
          projectId,
          jobId,
          analysisId,
          detectionKey: d.id,
          sheetKey: d.sheetKey,
          payload: d as unknown as Record<string, unknown>,
        })),
      );
    }

    await tx
      .delete(takeoffWarnings)
      .where(and(eq(takeoffWarnings.organizationId, organizationId), eq(takeoffWarnings.jobId, jobId)));
    const warningRows = collectWorkerWarningsFromResult(result);
    if (warningRows.length > 0) {
      await tx.insert(takeoffWarnings).values(
        warningRows.map((w) => ({
          organizationId,
          projectId,
          jobId,
          code: w.code,
          payload: warningRowPayload(w),
        })),
      );
    }

    await tx
      .update(takeoffJobs)
      .set({
        status: result.status === 'failed' ? 'failed' : result.status === 'partial' ? 'partial' : 'succeeded',
        stage: 'done',
        percent: 100,
        finishedAt: new Date(),
        resultIngestedAt: new Date(),
        resultStats: Object.keys(result.stats ?? {}).length ? result.stats : null,
        updatedAt: new Date(),
      })
      .where(and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId)));

    if (result.status !== 'failed') {
      await tx
        .update(takeoffAnalyses)
        .set({ status: 'in_review', updatedAt: new Date() })
        .where(and(eq(takeoffAnalyses.organizationId, organizationId), eq(takeoffAnalyses.id, analysisId)));
    } else {
      await tx
        .update(takeoffJobs)
        .set({ error: result.errors[0]?.message ?? 'failed', updatedAt: new Date() })
        .where(and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId)));
    }
  });

  return { alreadyIngested: false };
}

/** Result ingest failed after progress reached 100% — no partial sheet/detection rows. */
export async function markJobIngestFailed(
  db: DbExecutor,
  organizationId: string,
  jobId: string,
  error: string,
) {
  await db
    .update(takeoffJobs)
    .set({
      status: 'failed',
      stage: 'done',
      percent: 100,
      finishedAt: new Date(),
      error,
      updatedAt: new Date(),
    })
    .where(and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId)));
}

export async function updateJobProgress(
  db: DbExecutor,
  organizationId: string,
  jobId: string,
  patch: { stage: string; percent: number; message?: string | null; status?: string },
) {
  await db
    .update(takeoffJobs)
    .set({
      stage: patch.stage as (typeof takeoffJobs.$inferInsert)['stage'],
      percent: Math.round(patch.percent),
      message: patch.message ?? null,
      ...(patch.status ? { status: patch.status as (typeof takeoffJobs.$inferInsert)['status'] } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId)));
}

export async function markJobStarted(
  db: DbExecutor,
  organizationId: string,
  jobId: string,
  workerJobId: string,
) {
  await db
    .update(takeoffJobs)
    .set({
      status: 'running',
      workerJobId,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(takeoffJobs.organizationId, organizationId), eq(takeoffJobs.id, jobId)));
}

export async function insertArtifact(db: DbExecutor, row: typeof takeoffArtifacts.$inferInsert) {
  const [created] = await db.insert(takeoffArtifacts).values(row).returning();
  if (!created) throw new Error('insertArtifact');
  return created;
}

export async function setAnalysisStatus(
  db: DbExecutor,
  organizationId: string,
  analysisId: string,
  status: (typeof takeoffAnalyses.$inferInsert)['status'],
  extra?: Partial<typeof takeoffAnalyses.$inferInsert>,
) {
  await db
    .update(takeoffAnalyses)
    .set({ status, ...extra, updatedAt: new Date() })
    .where(and(eq(takeoffAnalyses.organizationId, organizationId), eq(takeoffAnalyses.id, analysisId)));
}

export async function attachApprovalToAnalysis(
  db: DbExecutor,
  organizationId: string,
  analysisId: string,
  approvalId: string,
  approvedByUserId: string,
) {
  await db
    .update(takeoffAnalyses)
    .set({
      status: 'approved',
      currentApprovalId: approvalId,
      approvedAt: new Date(),
      approvedByUserId,
      updatedAt: new Date(),
    })
    .where(and(eq(takeoffAnalyses.organizationId, organizationId), eq(takeoffAnalyses.id, analysisId)));
}

export async function markLatestApprovalReopened(db: DbExecutor, organizationId: string, analysisId: string) {
  await db
    .update(takeoffApprovals)
    .set({ reopenedAt: new Date() })
    .where(
      and(
        eq(takeoffApprovals.organizationId, organizationId),
        eq(takeoffApprovals.analysisId, analysisId),
        sql`${takeoffApprovals.reopenedAt} IS NULL`,
      ),
    );
}

export async function insertApproval(db: DbExecutor, row: typeof takeoffApprovals.$inferInsert) {
  const [created] = await db.insert(takeoffApprovals).values(row).returning();
  if (!created) throw new Error('insertApproval');
  return created;
}

export async function listLibrary(db: DbExecutor, organizationId: string, plannerKey: string) {
  return db
    .select()
    .from(takeoffPlannerSymbolLibrary)
    .where(and(eq(takeoffPlannerSymbolLibrary.organizationId, organizationId), eq(takeoffPlannerSymbolLibrary.plannerKey, plannerKey)));
}

export async function listRuleSets(db: DbExecutor, organizationId: string, projectId: string) {
  return db
    .select()
    .from(takeoffRuleSets)
    .where(
      and(
        eq(takeoffRuleSets.organizationId, organizationId),
        sql`(${takeoffRuleSets.projectId} IS NULL OR ${takeoffRuleSets.projectId} = ${projectId})`,
      ),
    );
}

export async function listCatalogOverrides(db: DbExecutor, organizationId: string) {
  return db.select().from(takeoffCatalogTypes).where(eq(takeoffCatalogTypes.organizationId, organizationId));
}

export async function findArtifact(db: DbExecutor, organizationId: string, artifactId: string) {
  const [row] = await db
    .select()
    .from(takeoffArtifacts)
    .where(and(eq(takeoffArtifacts.organizationId, organizationId), eq(takeoffArtifacts.id, artifactId)))
    .limit(1);
  return row ?? null;
}

export async function findArtifactByJobAndName(db: DbExecutor, organizationId: string, jobId: string, name: string) {
  const [row] = await db
    .select()
    .from(takeoffArtifacts)
    .where(
      and(
        eq(takeoffArtifacts.organizationId, organizationId),
        eq(takeoffArtifacts.jobId, jobId),
        eq(takeoffArtifacts.name, name),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listArtifactsForJob(db: DbExecutor, organizationId: string, jobId: string) {
  return db
    .select()
    .from(takeoffArtifacts)
    .where(and(eq(takeoffArtifacts.organizationId, organizationId), eq(takeoffArtifacts.jobId, jobId)));
}

export function editsFromRows(rows: { op: unknown }[]): TakeoffEdit[] {
  return rows.map((r) => r.op as TakeoffEdit);
}
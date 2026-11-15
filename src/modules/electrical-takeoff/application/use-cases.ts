import { createHash } from 'node:crypto';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { takeoffAnalyses } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { ExternalContext } from '@/shared/external';
import type {
  AnalysisSummary,
  CatalogType,
  ExportKind,
  MeasurementRuleSet,
  SymbolLibraryEntry,
  TakeoffEdit,
  TakeoffJobDto,
  TakeoffSourceKind,
} from '../domain/contracts';
import {
  TAKEOFF_CHUNK_BYTES,
  appendEdits,
  bumpAnalysisRevision,
  findAnalysis,
  findJob,
  insertAnalysis,
  insertApproval,
  insertFile,
  insertJob,
  listAnalysesForProject,
  deleteAnalysis,
  updateAnalysisName,
  setAnalysisArchived,
  isTakeoffArchivedAnalysisName,
  takeoffArchivedDisplayName,
  listCatalogOverrides,
  listLibrary,
  listRuleSets,
  listFilesForAnalysis,
  updateFileUpload,
  markJobStarted,
  markJobIngestFailed,
  nextEditSeq,
  attachApprovalToAnalysis,
  markLatestApprovalReopened,
  setAnalysisStatus,
} from '../data/takeoff.repository';
import { TakeoffError, takeoffApprovedLocked, takeoffRevisionConflict, takeoffWorkerUnavailable } from '../domain/errors';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { buildWorkerPairingAndSheetSelection } from '../domain/worker-job-request-build';
import { buildAnalysisView } from './get-analysis-view';
import { authorizeTakeoffProject, assertAnalysisAccess, type TakeoffActor } from './access';
import { sealJobToken } from './worker-token';
import { takeoffDeps } from '../server';
import { mimeForKind } from './takeoff-file-store';
import { createPendingProjectDocument } from '@/modules/evidence/application/document-records';
import { externalProviderFileStore } from '@/modules/evidence/server';
import { runCommittedStorageWrite } from '@/modules/external-storage/server';
import { assertOrgStorage } from '../server';
import {
  resolvePersistenceModeForNewAnalysis,
  TAKEOFF_PERSISTENCE,
} from './takeoff-persistence';
import { linkTakeoffCloudFileUseCase, type LinkTakeoffCloudFileClientInput } from './link-takeoff-cloud-file';
import { ephemeralExpiryDate, purgeEphemeralTakeoffUseCase } from './purge-ephemeral-takeoff';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/application/org-storage-gate';
import { ingestFakeWorkerResult } from './fake-worker-client';
import { loadDefaultCatalog } from './domain-runtime';
import { TAKEOFF_CONTRACT_VERSION, workerJobRequestSchema } from '../domain/contracts';

function internalActor(context: OrgContext): TakeoffActor {
  return { kind: 'internal', context };
}

function externalActor(context: ExternalContext): TakeoffActor {
  return { kind: 'external', context };
}

export async function listAnalysesUseCase(
  context: OrgContext,
  projectId: string,
  options?: { includeArchived?: boolean },
): Promise<AnalysisSummary[]> {
  await authorizeTakeoffProject(internalActor(context), projectId, 'view');
  const rows = await listAnalysesForProject(context.db, context.organizationId, projectId, options);
  return rows.map((a) => ({
    id: a.id,
    name: takeoffArchivedDisplayName(a.name),
    status: a.status as AnalysisSummary['status'],
    plannerKey: a.plannerKey,
    revision: a.revision,
    updatedAtIso: a.updatedAt.toISOString(),
    fileCount: 0,
    approvedAtIso: a.approvedAt?.toISOString() ?? null,
    persistenceMode: (a.persistenceMode ?? TAKEOFF_PERSISTENCE.persistent) as AnalysisSummary['persistenceMode'],
    archivedAtIso: isTakeoffArchivedAnalysisName(a.name) ? a.updatedAt.toISOString() : null,
  }));
}

export async function renameAnalysisUseCase(context: OrgContext, analysisId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new TakeoffError('forbidden');
  const analysis = await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  const baseName = isTakeoffArchivedAnalysisName(analysis.name) ? `[ARCHIVED] ${trimmed}` : trimmed;
  await updateAnalysisName(context.db, context.organizationId, analysis.id, baseName);
}

export async function archiveAnalysisUseCase(context: OrgContext, analysisId: string): Promise<void> {
  await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  await setAnalysisArchived(context.db, context.organizationId, analysisId, true);
}

export async function restoreAnalysisUseCase(context: OrgContext, analysisId: string): Promise<void> {
  await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  await setAnalysisArchived(context.db, context.organizationId, analysisId, false);
}

export async function deleteAnalysisUseCase(context: OrgContext, analysisId: string): Promise<void> {
  const analysis = await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  if (analysis.status === 'approved') throw new TakeoffError('analysis_locked_approved');
  const { purgeEphemeralAnalysisBytes } = await import('./takeoff-persistence');
  await asServiceRoleWrite(context.db, async () => {
    await purgeEphemeralAnalysisBytes(context.db, context.organizationId, analysisId);
    await deleteAnalysis(context.db, context.organizationId, analysisId);
  });
}

export async function getTakeoffInputCapabilitiesUseCase(
  context: OrgContext,
  projectId: string,
): Promise<{ persistenceDefault: 'persistent' | 'ephemeral'; canPickFromProjectCloud: boolean }> {
  await authorizeTakeoffProject(internalActor(context), projectId, 'view');
  const persistenceDefault = await resolvePersistenceModeForNewAnalysis(context);
  const canPickFromProjectCloud =
    persistenceDefault === TAKEOFF_PERSISTENCE.persistent && (await isOrganizationStorageConfigured(context));
  return { persistenceDefault, canPickFromProjectCloud };
}

export async function createAnalysisUseCase(
  context: OrgContext,
  projectId: string,
  input: { name: string; plannerKey?: string },
): Promise<AnalysisSummary> {
  await authorizeTakeoffProject(internalActor(context), projectId, 'manage');
  const persistenceMode = await resolvePersistenceModeForNewAnalysis(context);
  const row = await insertAnalysis(context.db, {
    organizationId: context.organizationId,
    projectId,
    name: input.name,
    plannerKey: input.plannerKey ?? 'unknown',
    createdByUserId: context.userId,
    createdByActorType: 'internal',
    persistenceMode,
    ephemeralExpiresAt: persistenceMode === TAKEOFF_PERSISTENCE.ephemeral ? ephemeralExpiryDate() : null,
  });
  return {
    id: row.id,
    name: row.name,
    status: row.status as AnalysisSummary['status'],
    plannerKey: row.plannerKey,
    revision: row.revision,
    updatedAtIso: row.updatedAt.toISOString(),
    fileCount: 0,
    approvedAtIso: null,
    persistenceMode: row.persistenceMode as AnalysisSummary['persistenceMode'],
  };
}

export async function linkTakeoffCloudFile(
  context: OrgContext,
  analysisId: string,
  input: LinkTakeoffCloudFileClientInput,
) {
  return linkTakeoffCloudFileUseCase(context, analysisId, input);
}

export async function purgeEphemeralTakeoff(context: OrgContext, analysisId: string): Promise<void> {
  return purgeEphemeralTakeoffUseCase(context, analysisId);
}

export async function getAnalysisViewUseCase(context: OrgContext, analysisId: string) {
  return buildAnalysisView(internalActor(context), analysisId);
}

export async function beginFileUploadUseCase(
  context: OrgContext,
  analysisId: string,
  input: { name: string; sizeBytes: number; kind: TakeoffSourceKind },
): Promise<{ fileId: string; chunkBytes: number }> {
  const analysis = await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  if (analysis.status === 'approved') takeoffApprovedLocked();
  const safeName = path.basename(input.name).replaceAll(/[/\\<>:"|?*]/g, '_');
  if (!safeName || safeName === '.' || safeName === '..') throw new TakeoffError('file_type_unsupported');
  const row = await insertFile(context.db, {
    organizationId: context.organizationId,
    projectId: analysis.projectId,
    analysisId,
    name: safeName,
    kind: input.kind,
    mimeType: mimeForKind(input.kind),
    sizeBytes: input.sizeBytes,
    uploadedByUserId: context.userId,
    uploadState: 'pending',
  });
  if (analysis.persistenceMode === TAKEOFF_PERSISTENCE.persistent && process.env.TAKEOFF_FILE_STORE !== 'memory') {
    await assertOrgStorage(context.db, context.organizationId);
    await runCommittedStorageWrite(async (db) => {
      const connection = await externalProviderFileStore.resolveConnection(context.organizationId);
      await createPendingProjectDocument(db, {
        documentId: row.id,
        organizationId: context.organizationId,
        connection,
        fileName: safeName,
        mimeType: mimeForKind(input.kind),
        sizeBytes: input.sizeBytes,
        uploadedByUserId: context.userId,
        owner: { type: 'project', id: analysis.projectId },
        label: 'takeoff_source',
      });
    });
    await updateFileUpload(context.db, context.organizationId, row.id, { storageDocumentId: row.id });
  }
  return { fileId: row.id, chunkBytes: TAKEOFF_CHUNK_BYTES };
}

export async function startAnalysisUseCase(
  context: OrgContext,
  analysisId: string,
  input: {
    fileIds: string[];
    pairing?: { pdfFileId: string; dwgFileId: string }[];
    /** @deprecated Misnamed in UI — file ids to include, not worker sheet keys. */
    sheetKeys?: string[];
    /** Restrict worker to specific sheets (fileId + sheetKey as returned by the worker). */
    sheetSelection?: { fileId: string; sheetKey: string }[];
    ruleSetId?: string;
    useAi?: boolean;
  },
): Promise<{ jobId: string }> {
  const analysis = await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  if (analysis.status === 'approved') takeoffApprovedLocked();
  const fake = process.env.TAKEOFF_USE_FAKE_WORKER === '1';
  if (!process.env.TAKEOFF_WORKER_SECRET || (!process.env.TAKEOFF_WORKER_URL && !fake)) takeoffWorkerUnavailable();

  const jobId = takeoffDeps.ids.uuid();
  const token = sealJobToken(
    jobId,
    process.env.TAKEOFF_WORKER_SECRET,
    1000 * 60 * 60 * 4,
    takeoffDeps.clock.now().getTime(),
  );

  const files = await listFilesForAnalysis(context.db, context.organizationId, analysisId);
  const selected = files.filter((f) => input.fileIds.includes(f.id) && f.uploadState === 'complete');
  if (selected.length === 0) throw new TakeoffError('not_found');

  const selectedForWorker = selected.map((f) => ({ id: f.id, name: f.name, kind: f.kind }));
  const { pairing, sheetSelection } = buildWorkerPairingAndSheetSelection(selectedForWorker, {
    explicitPairing: input.pairing,
    explicitSheetSelection: input.sheetSelection,
  });
  const persistedRequest = { ...input, pairing, sheetSelection };

  await insertJob(context.db, {
    id: jobId,
    organizationId: context.organizationId,
    projectId: analysis.projectId,
    analysisId,
    status: 'queued',
    tokenHash: token.hash,
    tokenExpiresAt: new Date(token.expiresAtMs),
    requestHash: createHash('sha256').update(JSON.stringify(persistedRequest)).digest('hex'),
    requestJson: persistedRequest as unknown as Record<string, unknown>,
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000';
  const catalog = await loadDefaultCatalog();
  const request = workerJobRequestSchema.parse({
    contractVersion: TAKEOFF_CONTRACT_VERSION,
    jobId,
    plannerKey: analysis.plannerKey,
    files: selected.map((f) => ({
      fileId: f.id,
      name: f.name,
      kind: f.kind,
      sizeBytes: f.sizeBytes,
      sha256: f.sha256 ?? undefined,
      downloadUrl: `${origin}/api/takeoff/worker/file/${jobId}/${f.id}`,
    })),
    pairing,
    sheetSelection,
    options: {
      previewMaxEdgePx: 6000,
      renderPreview: true,
      useAi: input.useAi === true,
      legendRegionHints: [],
    },
    callback: {
      progressUrl: `${origin}/api/takeoff/worker/progress/${jobId}`,
      resultUrl: `${origin}/api/takeoff/worker/result/${jobId}`,
      artifactUrl: `${origin}/api/takeoff/worker/artifact/${jobId}`,
      token: token.bearer,
    },
    catalog,
  });

  if (fake) {
    await markJobStarted(context.db, context.organizationId, jobId, jobId);
    await ingestFakeWorkerResult(context.db, request);
  } else {
    const dispatched = await takeoffDeps.worker.dispatch(request);
    await markJobStarted(context.db, context.organizationId, jobId, dispatched.workerJobId ?? jobId);
  }

  await context.db
    .update(takeoffAnalyses)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(and(eq(takeoffAnalyses.id, analysisId), eq(takeoffAnalyses.organizationId, context.organizationId)));

  return { jobId };
}

const TAKEOFF_JOB_PROGRESS_STALL_MS = 12 * 60 * 1000;

export async function getJobProgressUseCase(context: OrgContext, jobId: string): Promise<TakeoffJobDto> {
  let row = await findJob(context.db, context.organizationId, jobId);
  if (!row) throw new TakeoffError('not_found');
  await assertAnalysisAccess(internalActor(context), row.analysisId, 'view');
  if (
    (row.status === 'running' || row.status === 'queued') &&
    row.updatedAt &&
    Date.now() - row.updatedAt.getTime() > TAKEOFF_JOB_PROGRESS_STALL_MS
  ) {
    await markJobIngestFailed(
      context.db,
      context.organizationId,
      jobId,
      'worker_progress_stalled',
    );
    row = (await findJob(context.db, context.organizationId, jobId)) ?? row;
  }
  return {
    id: row.id,
    status: row.status as TakeoffJobDto['status'],
    stage: row.stage as TakeoffJobDto['stage'],
    percent: row.percent,
    message: row.message,
    startedAtIso: row.startedAt?.toISOString() ?? null,
    finishedAtIso: row.finishedAt?.toISOString() ?? null,
    error: row.error,
  };
}

export async function cancelJobUseCase(context: OrgContext, jobId: string): Promise<void> {
  const row = await findJob(context.db, context.organizationId, jobId);
  if (!row) throw new TakeoffError('not_found');
  await assertAnalysisAccess(internalActor(context), row.analysisId, 'manage');
  if (row.workerJobId) await takeoffDeps.worker.cancel(row.workerJobId);
}

export async function applyEditsUseCase(
  context: OrgContext,
  analysisId: string,
  edits: TakeoffEdit[],
  expectedRevision: number,
) {
  const analysis = await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  if (analysis.status === 'approved') takeoffApprovedLocked();
  const bumped = await bumpAnalysisRevision(context.db, context.organizationId, analysisId, expectedRevision);
  if (bumped === null) takeoffRevisionConflict();
  let seq = await nextEditSeq(context.db, analysisId);
  const rows = edits.map((op) => ({
    organizationId: context.organizationId,
    projectId: analysis.projectId,
    analysisId,
    seq: seq++,
    actorUserId: context.userId,
    actorType: 'internal' as const,
    op: op as unknown as Record<string, unknown>,
  }));
  await appendEdits(context.db, rows);
  return getAnalysisViewUseCase(context, analysisId);
}

export async function approveAnalysisUseCase(context: OrgContext, analysisId: string, expectedRevision: number) {
  await assertAnalysisAccess(internalActor(context), analysisId, 'approve');
  const analysis = await findAnalysis(context.db, context.organizationId, analysisId);
  if (!analysis) throw new TakeoffError('not_found');
  const bumped = await bumpAnalysisRevision(context.db, context.organizationId, analysisId, expectedRevision);
  if (bumped === null) takeoffRevisionConflict();
  const view = await buildAnalysisView(internalActor(context), analysisId);
  const approval = await insertApproval(context.db, {
    organizationId: context.organizationId,
    projectId: analysis.projectId,
    analysisId,
    boqJson: view.boq as unknown as Record<string, unknown>,
    detectionsHash: createHash('sha256').update(JSON.stringify(view.detections)).digest('hex'),
    fileVersionsJson: Object.fromEntries(view.files.map((f) => [f.id, f.sha256])),
    ruleSetVersion: view.ruleSet.version,
    approvedByUserId: context.userId,
  });
  await attachApprovalToAnalysis(context.db, context.organizationId, analysisId, approval.id, context.userId);
  return getAnalysisViewUseCase(context, analysisId);
}

export async function reopenAnalysisUseCase(context: OrgContext, analysisId: string, expectedRevision: number) {
  await assertAnalysisAccess(internalActor(context), analysisId, 'approve');
  const analysis = await findAnalysis(context.db, context.organizationId, analysisId);
  if (!analysis) throw new TakeoffError('not_found');
  if (analysis.persistenceMode === TAKEOFF_PERSISTENCE.ephemeral) throw new TakeoffError('forbidden');
  const bumped = await bumpAnalysisRevision(context.db, context.organizationId, analysisId, expectedRevision);
  if (bumped === null) takeoffRevisionConflict();
  await markLatestApprovalReopened(context.db, context.organizationId, analysisId);
  await setAnalysisStatus(context.db, context.organizationId, analysisId, 'in_review', {
    currentApprovalId: null,
    approvedAt: null,
    approvedByUserId: null,
  });
  return getAnalysisViewUseCase(context, analysisId);
}

export async function listLibraryUseCase(context: OrgContext, plannerKey: string): Promise<SymbolLibraryEntry[]> {
  const rows = await listLibrary(context.db, context.organizationId, plannerKey);
  return rows.map((r) => ({
    id: r.id,
    plannerKey: r.plannerKey,
    signatureKind: r.signatureKind as SymbolLibraryEntry['signatureKind'],
    signature: r.signature,
    template: r.template as SymbolLibraryEntry['template'],
    typeKey: r.typeKey,
    label: r.label ?? undefined,
    createdAtIso: r.createdAt.toISOString(),
  }));
}

export async function deleteLibraryEntryUseCase(context: OrgContext, entryId: string): Promise<void> {
  // service-role delete via repository omitted: lead may wire full delete
  void entryId;
  void context;
}

export async function listRuleSetsUseCase(context: OrgContext, projectId: string): Promise<MeasurementRuleSet[]> {
  await authorizeTakeoffProject(internalActor(context), projectId, 'view');
  const rows = await listRuleSets(context.db, context.organizationId, projectId);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    scope: r.scope as MeasurementRuleSet['scope'],
    version: r.version,
    rules: (r.rules as MeasurementRuleSet['rules']) ?? [],
  }));
}

export async function saveRuleSetUseCase(
  context: OrgContext,
  projectId: string,
  ruleSet: MeasurementRuleSet,
): Promise<MeasurementRuleSet> {
  await authorizeTakeoffProject(internalActor(context), projectId, 'manage');
  return ruleSet;
}

export async function setAnalysisRuleSetUseCase(
  context: OrgContext,
  analysisId: string,
  ruleSetId: string,
  expectedRevision: number,
) {
  const analysis = await assertAnalysisAccess(internalActor(context), analysisId, 'manage');
  const bumped = await bumpAnalysisRevision(context.db, context.organizationId, analysisId, expectedRevision);
  if (bumped === null) takeoffRevisionConflict();
  void ruleSetId;
  void analysis;
  return getAnalysisViewUseCase(context, analysisId);
}

export async function listCatalogUseCase(context: OrgContext): Promise<CatalogType[]> {
  const overrides = await listCatalogOverrides(context.db, context.organizationId);
  const { loadDefaultCatalog } = await import('./domain-runtime');
  const base = await loadDefaultCatalog();
  if (overrides.length === 0) return [...base];
  const map = new Map(base.map((t) => [t.key, t]));
  for (const row of overrides) {
    map.set(row.key, row.payload as unknown as CatalogType);
  }
  return [...map.values()];
}

export async function saveCatalogTypeUseCase(context: OrgContext, type: CatalogType): Promise<CatalogType> {
  void context;
  return type;
}

export async function requestExportUseCase(
  context: OrgContext,
  analysisId: string,
  kind: ExportKind,
): Promise<{ url: string; fileName: string }> {
  await assertAnalysisAccess(internalActor(context), analysisId, 'view');
  const path = kind === 'xlsx' ? 'xlsx' : kind;
  return { url: `/api/takeoff/export/${analysisId}?kind=${path}`, fileName: `takeoff-${analysisId}.${path === 'xlsx' ? 'xlsx' : 'pdf'}` };
}

export { externalActor };
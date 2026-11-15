import type {
  AnalysisSummary,
  AnalysisView,
  TakeoffJobDto,
} from '../domain/contracts';
import { resolveTakeoffPermissions } from '../domain/permissions';
import {
  editsFromRows,
  findAnalysis,
  latestSuccessfulJob,
  listAreas,
  listDetectionsForJob,
  listEdits,
  listFilesForAnalysis,
  listSheetsForJob,
  listWarningsForJob,
  listCatalogOverrides,
  findRuleSet,
} from '../data/takeoff.repository';
import { warningFromRow } from '../domain/worker-warnings';
import { computeBoq } from '../domain/boq-engine';
import { DEFAULT_RULE_SET } from '../domain/measurement';
import type { CatalogType, MeasurementRuleSet } from '../domain/contracts';
import type { DbExecutor } from '@/shared/db/types';
import { resolveSheetInclusion } from '../domain/sheet-selection';
import { loadApplyEdits, loadDefaultCatalog } from './domain-runtime';
import type { SheetDto } from '../domain/contracts';
import type { TakeoffActor } from './access';
import { loadPermissionFacts } from './access';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/application/org-storage-gate';
import { TAKEOFF_PERSISTENCE } from './takeoff-persistence';
import { takeoffNotFound } from '../domain/errors';
import { attachSheetPreviewUrls } from './resolve-sheet-previews';
import { formatTakeoffDisplayName, sanitizeWorkerSheetName } from '../domain/format-display-name';

export async function buildAnalysisView(actor: TakeoffActor, analysisId: string): Promise<AnalysisView> {
  const orgId = actor.kind === 'internal' ? actor.context.organizationId : actor.context.grants[0]?.organizationId;
  if (!orgId) takeoffNotFound();
  const db = actor.kind === 'internal' ? actor.context.db : actor.context.db;
  const analysis = await findAnalysis(db, orgId, analysisId);
  if (!analysis) takeoffNotFound();

  const files = await listFilesForAnalysis(db, orgId, analysisId);
  const job = await latestSuccessfulJob(db, orgId, analysisId);
  const editRows = await listEdits(db, orgId, analysisId);
  const areas = await listAreas(db, orgId, analysisId);

  const applyEdits = await loadApplyEdits();
  const catalog = await loadCatalogForOrg(db, orgId);

  const baseDetections = job ? await listDetectionsForJob(db, orgId, job.id) : [];
  const workerSheets = job ? await listSheetsForJob(db, orgId, job.id) : [];
  const editList = editsFromRows(editRows);
  const { detections } = applyEdits(baseDetections, editList);

  const sheetDtos: SheetDto[] = workerSheets.map((s, index) => ({
    sheetKey: s.sheetKey,
    fileId: s.fileId,
    name: sanitizeWorkerSheetName(s.name, index),
    kind: s.kind,
    index: s.index,
    widthPx: s.widthPx,
    heightPx: s.heightPx,
    previewUrl: s.previewArtifact ?? null,
    floorLabel: s.floorHint ?? null,
    scale: s.scale,
    analyzed: s.analyzed,
    xrefsMissing: s.xrefsMissing ?? [],
    hiddenByLayers: s.hiddenByLayers ?? 0,
  }));

  const twinIdByDetectionId = new Map<string, string | undefined>();
  const detectionFileIdById = new Map<string, string>();
  for (const d of baseDetections) {
    twinIdByDetectionId.set(d.id, d.twinId);
    detectionFileIdById.set(d.id, d.fileId);
  }

  const fileDtos = files.map((f) => ({
    id: f.id,
    name: formatTakeoffDisplayName(f.name),
    kind: f.kind as 'pdf' | 'dwg' | 'dxf',
    sizeBytes: f.sizeBytes,
    uploadedAtIso: f.createdAt.toISOString(),
    sha256: f.sha256,
  }));
  const inclusion = resolveSheetInclusion(sheetDtos, fileDtos, editList);
  const includedSheetRefIds = new Set(
    [...inclusion.entries()].filter(([, on]) => on).map(([ref]) => ref),
  );

  const ruleSet = await loadRuleSetForAnalysis(db, orgId, analysis.ruleSetId);
  const approved = analysis.status === 'approved';
  const workerStats = (job?.resultStats ?? {}) as Record<string, number>;
  const boq = computeBoq({
    detections,
    workerDetections: baseDetections,
    sheets: sheetDtos,
    areas: areas.map((a) => ({
      id: a.id,
      sheetKey: a.sheetKey,
      name: a.name,
      polygon: a.polygon as [number, number][],
    })),
    catalog,
    ruleSet,
    linear: [],
    state: approved ? 'approved' : 'draft',
    twinIdByDetectionId,
    detectionFileIdById,
    includedSheetRefIds,
    mergeMatchedPairs:
      typeof workerStats.merge_matched_pairs === 'number'
        ? workerStats.merge_matched_pairs
        : typeof workerStats['merge_matched_pairs:lightg'] === 'number'
          ? workerStats['merge_matched_pairs:lightg']
          : undefined,
  });

  const summary: AnalysisSummary = {
    id: analysis.id,
    name: analysis.name,
    status: analysis.status as AnalysisSummary['status'],
    plannerKey: analysis.plannerKey,
    revision: analysis.revision,
    updatedAtIso: analysis.updatedAt.toISOString(),
    fileCount: files.length,
    approvedAtIso: analysis.approvedAt?.toISOString() ?? null,
    persistenceMode: (analysis.persistenceMode ?? 'persistent') as AnalysisSummary['persistenceMode'],
  };

  const warningRows = job ? await listWarningsForJob(db, orgId, job.id) : [];
  const workerWarnings = warningRows.map((row) => warningFromRow(row.code, row.payload as Record<string, unknown>));

  const lastJob: TakeoffJobDto | null = job
    ? {
        id: job.id,
        status: job.status as TakeoffJobDto['status'],
        stage: job.stage as TakeoffJobDto['stage'],
        percent: job.percent,
        message: job.message,
        startedAtIso: job.startedAt?.toISOString() ?? null,
        finishedAtIso: job.finishedAt?.toISOString() ?? null,
        error: job.error,
        stats: Object.keys(workerStats).length ? workerStats : undefined,
      }
    : null;

  const sheetsForView = job ? await attachSheetPreviewUrls(db, orgId, job.id, sheetDtos) : sheetDtos;

  const persistenceMode =
    (analysis.persistenceMode as 'persistent' | 'ephemeral' | null) ?? TAKEOFF_PERSISTENCE.persistent;
  const canPickFromProjectCloud =
    actor.kind === 'internal' &&
    persistenceMode === TAKEOFF_PERSISTENCE.persistent &&
    (await isOrganizationStorageConfigured(actor.context));
  const permissions = resolveTakeoffPermissions(
    await loadPermissionFacts(actor, {
      projectId: analysis.projectId,
      analysisApproved: approved,
      persistenceMode,
      canPickFromProjectCloud,
    }),
  );

  return {
    summary,
    files: files.map((f) => ({
      id: f.id,
      name: f.name,
      kind: f.kind as AnalysisView['files'][number]['kind'],
      sizeBytes: f.sizeBytes,
      uploadedAtIso: f.createdAt.toISOString(),
      sha256: f.sha256,
    })),
    sheets: sheetsForView,
    detections,
    areas: areas.map((a) => ({
      id: a.id,
      sheetKey: a.sheetKey,
      name: a.name,
      polygon: a.polygon as [number, number][],
    })),
    boq,
    catalog: [...catalog],
    ruleSet,
    lastJob,
    workerWarnings,
    workerStats,
    permissions,
    appliedEdits: editList,
  };
}

async function loadCatalogForOrg(db: DbExecutor, organizationId: string): Promise<CatalogType[]> {
  const base = await loadDefaultCatalog();
  const overrides = await listCatalogOverrides(db, organizationId);
  if (overrides.length === 0) return [...base];
  const map = new Map(base.map((type) => [type.key, type]));
  for (const row of overrides) {
    if (row.archived) {
      map.delete(row.key);
      continue;
    }
    map.set(row.key, row.payload as unknown as CatalogType);
  }
  return [...map.values()];
}

async function loadRuleSetForAnalysis(
  db: DbExecutor,
  organizationId: string,
  ruleSetId: string | null,
): Promise<MeasurementRuleSet> {
  if (!ruleSetId) return DEFAULT_RULE_SET;
  const row = await findRuleSet(db, organizationId, ruleSetId);
  if (!row) return DEFAULT_RULE_SET;
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    version: row.version,
    rules: (row.rules as MeasurementRuleSet['rules']) ?? [],
  };
}
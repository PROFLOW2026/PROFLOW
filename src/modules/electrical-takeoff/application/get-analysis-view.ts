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
  listLegendEntriesForJob,
  listSheetsForJob,
  listWarningsForJob,
  findRuleSet,
  findApproval,
} from '../data/takeoff.repository';
import { warningFromRow } from '../domain/worker-warnings';
import { computeBoq } from '../domain/boq-engine';
import { enrichDetectionsWithLegendIdentity } from '../domain/legend-identity';
import { freezeApprovedBoq } from '../domain/approved-boq';
import { DEFAULT_RULE_SET } from '../domain/measurement';
import type { MeasurementRuleSet } from '../domain/contracts';
import type { DbExecutor } from '@/shared/db/types';
import { loadCatalogForOrg } from './org-catalog';
import { resolveSheetInclusion } from '../domain/sheet-selection';
import { loadApplyEdits } from './domain-runtime';
import type { SheetDto } from '../domain/contracts';
import type { TakeoffActor } from './access';
import { loadPermissionFacts } from './access';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/application/org-storage-gate';
import { TAKEOFF_PERSISTENCE } from './takeoff-persistence';
import { takeoffNotFound } from '../domain/errors';
import { attachSheetPreviewUrls } from './resolve-sheet-previews';
import { formatTakeoffDisplayName, sanitizeWorkerSheetName } from '../domain/format-display-name';
import { planReviewConfirmed } from '../domain/plan-review';
import {
  sanitizeTakeoffLegendForActor,
  sanitizeTakeoffSheetXrefsForActor,
  sanitizeTakeoffWorkerStatsForActor,
} from './takeoff-analysis-xref-view';

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
  const { detections: edited } = applyEdits(baseDetections, editList);

  const sheetDtos: SheetDto[] = workerSheets.map((s, index) => {
    const xrefs = sanitizeTakeoffSheetXrefsForActor(actor, {
      xrefRefs: (s.xrefRefs ?? []) as NonNullable<SheetDto['xrefRefs']>,
      xrefsMissing: (s.xrefsMissing ?? []) as NonNullable<SheetDto['xrefsMissing']>,
    });
    return {
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
      xrefsMissing: xrefs.xrefsMissing,
      xrefRefs: xrefs.xrefRefs,
      hiddenByLayers: s.hiddenByLayers ?? 0,
    };
  });

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
  const workerStats = sanitizeTakeoffWorkerStatsForActor(
    actor,
    (job?.resultStats ?? {}) as Record<string, number | string | Record<string, string>>,
  );
  const mergeMatched =
    typeof workerStats.merge_matched_pairs === 'number'
      ? workerStats.merge_matched_pairs
      : typeof workerStats['merge_matched_pairs:lightg'] === 'number'
        ? workerStats['merge_matched_pairs:lightg']
        : undefined;
  const legendRows = job ? await listLegendEntriesForJob(db, orgId, job.id) : [];
  const legend = sanitizeTakeoffLegendForActor(actor, legendRows);
  const detections = enrichDetectionsWithLegendIdentity(edited, legend, {
    classifiedByById: new Map(baseDetections.map((row) => [row.id, row.classifiedBy])),
  });
  const liveBoq = computeBoq({
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
    mergeMatchedPairs: mergeMatched,
  });
  const approval =
    approved && analysis.currentApprovalId
      ? await findApproval(db, orgId, analysis.currentApprovalId)
      : null;
  const boq = approved ? freezeApprovedBoq(approval?.boqJson, liveBoq) : liveBoq;

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
        updatedAtIso: job.updatedAt?.toISOString() ?? null,
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
    legend,
    permissions,
    appliedEdits: editList,
    planReviewConfirmed: planReviewConfirmed(editList),
  };
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
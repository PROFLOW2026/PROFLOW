import type {
  AnalysisSummary,
  AnalysisView,
  CatalogType,
  ExportKind,
  MeasurementRuleSet,
  SymbolLibraryEntry,
  TakeoffClientApi,
  TakeoffEdit,
  TakeoffJobDto,
  TakeoffSourceKind,
  WorkerDetection,
} from '../domain/contracts';
import {
  DEMO_ANALYSIS_ID,
  DEMO_PROJECT_ID,
  buildDemoAnalysisView,
  buildDemoDetections,
  buildEmptyAnalysisSummary,
} from './fixtures/demo-fixture';
import { REAL7155_ANALYSIS_ID, getReal7155Fixture } from './fixtures/real7155-fixture';
import { PINS_ANALYSIS_ID, getPinsFixture } from './fixtures/pins-fixture';
import { effectiveToWorker, rebuildViewFromEdits } from './domain-preview';
import { buildLegendLibraryEntry } from '../domain/library';
import { TakeoffError } from '../domain/errors';
import { takeoffBoqApprovalBlocked } from '../domain/legend-identity';
import { TakeoffRevisionConflictError } from './takeoff-errors';
import {
  applyOrgDisplayName,
  buildCustomCatalogType,
  findActiveNameDuplicate,
  isDefaultCatalogKey,
} from '../domain/catalog';
import type { CatalogTypeArchiveInput, CatalogTypeCreateInput, CatalogTypeUpdateInput } from '../domain/contracts';

export { TakeoffRevisionConflictError };

type AnalysisRecord = {
  view: AnalysisView;
  workerBase: WorkerDetection[];
  edits: TakeoffEdit[];
};

type Store = {
  analyses: Map<string, AnalysisRecord>;
  projectIndex: Map<string, string[]>;
  jobs: Map<string, TakeoffJobDto>;
  libraries: Map<string, SymbolLibraryEntry[]>;
  ruleSets: MeasurementRuleSet[];
};

function toWorkerBase(detections: ReturnType<typeof buildDemoDetections>, fileId = 'file-demo-pdf') {
  return detections.map((d) => effectiveToWorker(d, fileId));
}

function patchStoreCatalog(store: Store, type: CatalogType): void {
  for (const record of store.analyses.values()) {
    const map = new Map(record.view.catalog.map((row) => [row.key, row]));
    map.set(type.key, type);
    record.view = { ...record.view, catalog: [...map.values()] };
  }
}

function bumpRecord(record: AnalysisRecord, edits: TakeoffEdit[]): AnalysisRecord {
  const mergedEdits = [...record.edits, ...edits];
  const view = rebuildViewFromEdits({
    view: record.view,
    workerBase: record.workerBase,
    edits: mergedEdits,
  });
  view.summary.revision += edits.length;
  return { view, workerBase: record.workerBase, edits: mergedEdits };
}

export type TakeoffMockFixture = 'default' | 'real7155' | 'pins';

function freshStore(fixture: TakeoffMockFixture = 'default'): Store {
  const detections = buildDemoDetections();
  const demoView = rebuildViewFromEdits({
    view: buildDemoAnalysisView(detections),
    workerBase: toWorkerBase(detections),
    edits: [],
  });
  const record: AnalysisRecord = { view: demoView, workerBase: toWorkerBase(detections), edits: [] };

  const analyses = new Map([[demoView.summary.id, record]]);
  const projectList = [demoView.summary.id];

  if (fixture === 'real7155') {
    const { view, workerBase } = getReal7155Fixture();
    const realView = rebuildViewFromEdits({ view, workerBase, edits: [] });
    analyses.set(REAL7155_ANALYSIS_ID, { view: realView, workerBase, edits: [] });
    projectList.unshift(REAL7155_ANALYSIS_ID);
  }

  if (fixture === 'pins') {
    const { view, workerBase } = getPinsFixture();
    const pinsView = rebuildViewFromEdits({ view, workerBase, edits: [] });
    analyses.set(PINS_ANALYSIS_ID, { view: pinsView, workerBase, edits: [] });
    projectList.unshift(PINS_ANALYSIS_ID);
  }

  return {
    analyses,
    projectIndex: new Map([[DEMO_PROJECT_ID, projectList]]),
    jobs: new Map(),
    libraries: new Map([['planner-demo', []], ['7155_light_g', []]]),
    ruleSets: [demoView.ruleSet],
  };
}

let activeFixture: TakeoffMockFixture = 'default';
let store = freshStore(activeFixture);

function storeLegendLibrarySaves(plannerKey: string, edits: readonly TakeoffEdit[]): void {
  const existing = store.libraries.get(plannerKey) ?? [];
  let next = existing;
  for (const edit of edits) {
    if (edit.op !== 'save_legend') continue;
    const entry = buildLegendLibraryEntry({
      id: `legend-lib-${edit.legendKey}`,
      plannerKey,
      legendKey: edit.legendKey,
      typeKey: edit.typeKey,
    });
    next = [
      ...next.filter((row) => !(row.signatureKind === entry.signatureKind && row.signature === entry.signature)),
      entry,
    ];
  }
  if (next !== existing) store.libraries.set(plannerKey, next);
}

export function resetTakeoffMockStore(fixture: TakeoffMockFixture = activeFixture): void {
  activeFixture = fixture;
  store = freshStore(fixture);
}

export function createMockTakeoffApi(fixture: TakeoffMockFixture = 'default'): TakeoffClientApi {
  if (fixture !== activeFixture) resetTakeoffMockStore(fixture);
  return {
    async listAnalyses(projectId: string, options?: { includeArchived?: boolean }) {
      const ids = store.projectIndex.get(projectId) ?? [];
      return ids
        .map((id) => store.analyses.get(id)?.view.summary)
        .filter((s): s is AnalysisSummary => Boolean(s))
        .filter((s) => options?.includeArchived || !s.archivedAtIso);
    },

    async renameAnalysis(analysisId: string, name: string) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      record.view = { ...record.view, summary: { ...record.view.summary, name } };
    },

    async archiveAnalysis(analysisId: string) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      record.view = {
        ...record.view,
        summary: { ...record.view.summary, archivedAtIso: new Date().toISOString() },
      };
    },

    async restoreAnalysis(analysisId: string) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      record.view = {
        ...record.view,
        summary: { ...record.view.summary, archivedAtIso: null },
      };
    },

    async deleteAnalysis(analysisId: string) {
      store.analyses.delete(analysisId);
    },

    async createAnalysis(projectId: string, input: { name: string; plannerKey?: string }) {
      const summary = buildEmptyAnalysisSummary(input.name);
      if (input.plannerKey) summary.plannerKey = input.plannerKey;
      const emptyBase = buildDemoAnalysisView(buildDemoDetections(0));
      const record: AnalysisRecord = {
        view: { ...emptyBase, summary, detections: [], files: [], sheets: [] },
        workerBase: [],
        edits: [],
      };
      store.analyses.set(summary.id, record);
      const list = store.projectIndex.get(projectId) ?? [];
      store.projectIndex.set(projectId, [summary.id, ...list]);
      return summary;
    },

    async getAnalysisView(analysisId: string) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      const view = rebuildViewFromEdits({
        view: record.view,
        workerBase: record.workerBase,
        edits: record.edits,
      });
      store.analyses.set(analysisId, { ...record, view });
      return structuredClone({ ...view, appliedEdits: [...record.edits] });
    },

    async getTakeoffInputCapabilities() {
      return { persistenceDefault: 'persistent' as const, canPickFromProjectCloud: false };
    },
    async linkCloudFile(_analysisId: string, input: { fileName: string }) {
      return { fileId: `cloud-${input.fileName}`, kind: 'pdf' as const };
    },
    async purgeEphemeralTakeoff() {},
    async beginFileUpload(_analysisId: string, input: { name: string; sizeBytes: number; kind: TakeoffSourceKind }) {
      return { fileId: `file-${input.name}-${Date.now()}`, chunkBytes: 256 * 1024 };
    },

    async startAnalysis(analysisId: string, input: { fileIds: string[] }) {
      const jobId = `job-${Date.now()}`;
      const job: TakeoffJobDto = {
        id: jobId,
        status: 'running',
        stage: 'queued',
        percent: 0,
        message: null,
        startedAtIso: new Date().toISOString(),
        finishedAtIso: null,
        error: null,
      };
      store.jobs.set(jobId, job);
      const record = store.analyses.get(analysisId);
      if (record) {
        record.view.summary.status = 'processing';
        record.view.lastJob = job;
        record.view.files = input.fileIds.map((id, i) => ({
          id,
          name: `upload-${i + 1}.pdf`,
          kind: 'pdf' as const,
          sizeBytes: 1_000_000,
          uploadedAtIso: new Date().toISOString(),
          sha256: null,
        }));
      }
      void simulateJob(jobId, analysisId);
      return { jobId };
    },

    async getJobProgress(jobId: string) {
      const job = store.jobs.get(jobId);
      if (!job) throw new Error('not_found');
      return { ...job };
    },

    async cancelJob(jobId: string) {
      const job = store.jobs.get(jobId);
      if (job) {
        job.status = 'cancelled';
        job.stage = 'done';
        job.finishedAtIso = new Date().toISOString();
      }
    },

    async applyEdits(analysisId: string, edits: TakeoffEdit[], expectedRevision: number) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      if (record.view.summary.revision !== expectedRevision) {
        throw new TakeoffRevisionConflictError();
      }
      if (record.view.summary.status === 'approved') throw new Error('analysis_locked_approved');
      storeLegendLibrarySaves(record.view.summary.plannerKey, edits);
      const next = bumpRecord(record, edits);
      store.analyses.set(analysisId, next);
      return structuredClone({ ...next.view, appliedEdits: [...next.edits] });
    },

    async approveAnalysis(analysisId: string, expectedRevision: number) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      if (record.view.summary.revision !== expectedRevision) throw new TakeoffRevisionConflictError();
      if (takeoffBoqApprovalBlocked(record.view.boq)) {
        throw new TakeoffError('approval_blocked_review');
      }
      if (!record.view.planReviewConfirmed) throw new TakeoffError('approval_blocked_plan_review');
      record.view.summary.status = 'approved';
      record.view.summary.approvedAtIso = new Date().toISOString();
      record.view.boq = rebuildViewFromEdits({
        view: { ...record.view, summary: { ...record.view.summary, status: 'approved' } },
        workerBase: record.workerBase,
        edits: record.edits,
      }).boq;
      record.view.permissions.canEdit = false;
      record.view.summary.revision += 1;
      return structuredClone(record.view);
    },

    async reopenAnalysis(analysisId: string, expectedRevision: number) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      if (record.view.summary.revision !== expectedRevision) throw new TakeoffRevisionConflictError();
      record.view.summary.status = 'in_review';
      record.view.summary.approvedAtIso = null;
      record.view.boq.state = 'draft';
      record.view.boq.lines = record.view.boq.lines.map((l) => ({ ...l, verified: false }));
      record.view.permissions.canEdit = true;
      record.view.summary.revision += 1;
      return structuredClone(record.view);
    },

    async listLibrary(plannerKey: string) {
      return [...(store.libraries.get(plannerKey) ?? [])];
    },

    async deleteLibraryEntry(entryId: string) {
      for (const [key, entries] of store.libraries) {
        store.libraries.set(
          key,
          entries.filter((e) => e.id !== entryId),
        );
      }
    },

    async listRuleSets(_projectId: string) {
      return structuredClone(store.ruleSets);
    },

    async saveRuleSet(_projectId: string, ruleSet: MeasurementRuleSet) {
      const idx = store.ruleSets.findIndex((r) => r.id === ruleSet.id);
      if (idx >= 0) store.ruleSets[idx] = ruleSet;
      else store.ruleSets.push(ruleSet);
      return ruleSet;
    },

    async setAnalysisRuleSet(analysisId: string, ruleSetId: string, expectedRevision: number) {
      const record = store.analyses.get(analysisId);
      if (!record) throw new Error('not_found');
      if (record.view.summary.revision !== expectedRevision) throw new TakeoffRevisionConflictError();
      const rs = store.ruleSets.find((r) => r.id === ruleSetId);
      if (!rs) throw new Error('not_found');
      record.view.ruleSet = rs;
      record.view.summary.revision += 1;
      record.view = rebuildViewFromEdits({
        view: record.view,
        workerBase: record.workerBase,
        edits: record.edits,
      });
      return structuredClone(record.view);
    },

    async listCatalog() {
      const first = store.analyses.values().next().value as AnalysisRecord | undefined;
      return structuredClone(first?.view.catalog ?? buildDemoAnalysisView().catalog);
    },

    async saveCatalogType(type: CatalogType) {
      const existing = [...store.analyses.values()][0]?.view.catalog.find((row) => row.key === type.key);
      if (!existing) return this.createCatalogType({ category: type.category, nameHe: type.nameHe });
      if (type.archived !== existing.archived) {
        return this.archiveCatalogType({ key: type.key, archived: type.archived });
      }
      return this.updateCatalogType({ key: type.key, nameHe: type.nameHe });
    },

    async createCatalogType(input: CatalogTypeCreateInput) {
      const catalog = [...store.analyses.values()][0]?.view.catalog ?? [];
      if (findActiveNameDuplicate(catalog, input.nameHe)) throw new TakeoffError('catalog_duplicate');
      const type = buildCustomCatalogType({ category: input.category, nameHe: input.nameHe, catalog });
      patchStoreCatalog(store, type);
      return type;
    },

    async updateCatalogType(input: CatalogTypeUpdateInput) {
      const catalog = [...store.analyses.values()][0]?.view.catalog ?? [];
      const existing = catalog.find((row) => row.key === input.key);
      if (!existing) throw new TakeoffError('not_found');
      if (findActiveNameDuplicate(catalog, input.nameHe, existing.key)) throw new TakeoffError('catalog_duplicate');
      const type = applyOrgDisplayName(existing, input.nameHe);
      patchStoreCatalog(store, type);
      return type;
    },

    async archiveCatalogType(input: CatalogTypeArchiveInput) {
      const catalog = [...store.analyses.values()][0]?.view.catalog ?? [];
      const existing = catalog.find((row) => row.key === input.key);
      if (!existing) throw new TakeoffError('not_found');
      if (isDefaultCatalogKey(existing.key)) throw new TakeoffError('catalog_invalid');
      const type = { ...existing, archived: input.archived };
      patchStoreCatalog(store, type);
      return type;
    },

    async requestExport(_analysisId: string, kind: ExportKind) {
      const fileName =
        kind === 'xlsx' ? 'takeoff-boq.xlsx' : kind === 'boq-pdf' ? 'takeoff-boq.pdf' : 'takeoff-annotated.pdf';
      return { url: `/takeoff-fixtures/preview-light-g.png`, fileName };
    },
  };
}

const STAGES: TakeoffJobDto['stage'][] = [
  'queued',
  'downloading',
  'detect_type',
  'sheets',
  'legend',
  'extract',
  'classify',
  'merge',
  'render',
  'upload',
  'done',
];

async function simulateJob(jobId: string, analysisId: string) {
  const job = store.jobs.get(jobId);
  if (!job) return;
  for (let i = 0; i < STAGES.length; i += 1) {
    await delay(450);
    const stage = STAGES[i]!;
    job.stage = stage;
    job.percent = Math.round((i / (STAGES.length - 1)) * 100);
    if (stage === 'done') {
      job.status = 'succeeded';
      job.finishedAtIso = new Date().toISOString();
      job.percent = 100;
      const detections = buildDemoDetections();
      const demoView = rebuildViewFromEdits({
        view: buildDemoAnalysisView(detections),
        workerBase: toWorkerBase(detections),
        edits: [],
      });
      const record = store.analyses.get(analysisId);
      if (record) {
        record.view = { ...demoView, summary: { ...record.view.summary, status: 'in_review' }, lastJob: { ...job } };
        record.workerBase = toWorkerBase(detections);
        record.edits = [];
      }
      return;
    }
  }
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export { DEMO_ANALYSIS_ID, DEMO_PROJECT_ID, PINS_ANALYSIS_ID, REAL7155_ANALYSIS_ID };
'use server';

import { requireSession, runInOrgContext } from '@/shared/auth/session';
import type { OrgContext } from '@/shared/auth/context';
import { catalogActionFailure, mapTakeoffCaught, TakeoffError, type CatalogActionFailure } from './domain/errors';
import type {
  AnalysisSummary,
  AnalysisView,
  CatalogType,
  CatalogTypeArchiveInput,
  CatalogTypeCreateInput,
  CatalogTypeUpdateInput,
  ExportKind,
  MeasurementRuleSet,
  SymbolLibraryEntry,
  TakeoffEdit,
  TakeoffJobDto,
  TakeoffSourceKind,
} from './domain/contracts';
import {
  applyEditsUseCase,
  approveAnalysisUseCase,
  beginFileUploadUseCase,
  cancelJobUseCase,
  createAnalysisUseCase,
  getAnalysisViewUseCase,
  getJobProgressUseCase,
  listAnalysesUseCase,
  archiveCatalogTypeUseCase,
  createCatalogTypeUseCase,
  listCatalogUseCase,
  listLibraryUseCase,
  listRuleSetsUseCase,
  reopenAnalysisUseCase,
  requestExportUseCase,
  saveCatalogTypeUseCase,
  updateCatalogTypeUseCase,
  saveRuleSetUseCase,
  setAnalysisRuleSetUseCase,
  startAnalysisUseCase,
  deleteLibraryEntryUseCase,
  getTakeoffInputCapabilitiesUseCase,
  linkTakeoffCloudFile,
  purgeEphemeralTakeoff,
  renameAnalysisUseCase,
  archiveAnalysisUseCase,
  restoreAnalysisUseCase,
  deleteAnalysisUseCase,
} from './application/use-cases';

async function withOrg<T>(run: (ctx: OrgContext) => Promise<T>): Promise<T> {
  const session = await requireSession();
  if (!session.activeOrganizationId) throw new Error('forbidden');
  try {
    return await runInOrgContext(session.user.id, session.activeOrganizationId, (context) => run(context));
  } catch (error) {
    return mapTakeoffCaught(error);
  }
}

export async function listAnalyses(
  projectId: string,
  options?: { includeArchived?: boolean },
): Promise<AnalysisSummary[]> {
  return withOrg((ctx) => listAnalysesUseCase(ctx, projectId, options));
}

export async function renameAnalysis(analysisId: string, name: string): Promise<void> {
  return withOrg((ctx) => renameAnalysisUseCase(ctx, analysisId, name));
}

export async function archiveAnalysis(analysisId: string): Promise<void> {
  return withOrg((ctx) => archiveAnalysisUseCase(ctx, analysisId));
}

export async function restoreAnalysis(analysisId: string): Promise<void> {
  return withOrg((ctx) => restoreAnalysisUseCase(ctx, analysisId));
}

export async function deleteAnalysisAction(analysisId: string): Promise<void> {
  return withOrg((ctx) => deleteAnalysisUseCase(ctx, analysisId));
}

export async function createAnalysis(
  projectId: string,
  input: { name: string; plannerKey?: string },
): Promise<AnalysisSummary> {
  return withOrg((ctx) => createAnalysisUseCase(ctx, projectId, input));
}

export async function getAnalysisView(analysisId: string): Promise<AnalysisView> {
  return withOrg((ctx) => getAnalysisViewUseCase(ctx, analysisId));
}

export async function beginFileUpload(
  analysisId: string,
  input: { name: string; sizeBytes: number; kind: TakeoffSourceKind },
): Promise<{ fileId: string; chunkBytes: number }> {
  return withOrg((ctx) => beginFileUploadUseCase(ctx, analysisId, input));
}

export async function startAnalysis(
  analysisId: string,
  input: {
    fileIds: string[];
    pairing?: { pdfFileId: string; dwgFileId: string }[];
    sheetKeys?: string[];
    sheetSelection?: { fileId: string; sheetKey: string }[];
    ruleSetId?: string;
    useAi?: boolean;
  },
): Promise<{ jobId: string }> {
  return withOrg((ctx) => startAnalysisUseCase(ctx, analysisId, input));
}

export async function getJobProgress(jobId: string): Promise<TakeoffJobDto> {
  return withOrg((ctx) => getJobProgressUseCase(ctx, jobId));
}

export async function cancelJob(jobId: string): Promise<void> {
  return withOrg((ctx) => cancelJobUseCase(ctx, jobId));
}

export async function applyEdits(analysisId: string, edits: TakeoffEdit[], expectedRevision: number): Promise<AnalysisView> {
  return withOrg((ctx) => applyEditsUseCase(ctx, analysisId, edits, expectedRevision));
}

export async function approveAnalysis(analysisId: string, expectedRevision: number): Promise<AnalysisView> {
  return withOrg((ctx) => approveAnalysisUseCase(ctx, analysisId, expectedRevision));
}

export async function reopenAnalysis(analysisId: string, expectedRevision: number): Promise<AnalysisView> {
  return withOrg((ctx) => reopenAnalysisUseCase(ctx, analysisId, expectedRevision));
}

export async function listLibrary(plannerKey: string): Promise<SymbolLibraryEntry[]> {
  return withOrg((ctx) => listLibraryUseCase(ctx, plannerKey));
}

export async function deleteLibraryEntry(entryId: string): Promise<void> {
  return withOrg((ctx) => deleteLibraryEntryUseCase(ctx, entryId));
}

export async function listRuleSets(projectId: string): Promise<MeasurementRuleSet[]> {
  return withOrg((ctx) => listRuleSetsUseCase(ctx, projectId));
}

export async function saveRuleSet(projectId: string, ruleSet: MeasurementRuleSet): Promise<MeasurementRuleSet> {
  return withOrg((ctx) => saveRuleSetUseCase(ctx, projectId, ruleSet));
}

export async function setAnalysisRuleSet(
  analysisId: string,
  ruleSetId: string,
  expectedRevision: number,
): Promise<AnalysisView> {
  return withOrg((ctx) => setAnalysisRuleSetUseCase(ctx, analysisId, ruleSetId, expectedRevision));
}

export async function listCatalog(): Promise<CatalogType[]> {
  return withOrg((ctx) => listCatalogUseCase(ctx));
}

export async function saveCatalogType(type: CatalogType): Promise<CatalogType> {
  return withOrg((ctx) => saveCatalogTypeUseCase(ctx, type));
}

async function withOrgCatalog(run: (ctx: OrgContext) => Promise<CatalogType>): Promise<CatalogType | CatalogActionFailure> {
  try {
    return await withOrg(run);
  } catch (error) {
    if (error instanceof TakeoffError) return catalogActionFailure(error);
    throw error;
  }
}

export async function createCatalogType(input: CatalogTypeCreateInput): Promise<CatalogType | CatalogActionFailure> {
  return withOrgCatalog((ctx) => createCatalogTypeUseCase(ctx, input));
}

export async function updateCatalogType(input: CatalogTypeUpdateInput): Promise<CatalogType | CatalogActionFailure> {
  return withOrgCatalog((ctx) => updateCatalogTypeUseCase(ctx, input));
}

export async function archiveCatalogType(input: CatalogTypeArchiveInput): Promise<CatalogType | CatalogActionFailure> {
  return withOrgCatalog((ctx) => archiveCatalogTypeUseCase(ctx, input));
}

export async function requestExport(analysisId: string, kind: ExportKind): Promise<{ url: string; fileName: string }> {
  return withOrg((ctx) => requestExportUseCase(ctx, analysisId, kind));
}

export async function getTakeoffInputCapabilities(projectId: string) {
  return withOrg((ctx) => getTakeoffInputCapabilitiesUseCase(ctx, projectId));
}

export async function linkTakeoffCloudFileAction(
  analysisId: string,
  input: { providerFileId: string; fileName: string; mimeType: string; parentFolderId: string },
) {
  return withOrg((ctx) => linkTakeoffCloudFile(ctx, analysisId, input));
}

export async function purgeEphemeralTakeoffAction(analysisId: string): Promise<void> {
  return withOrg((ctx) => purgeEphemeralTakeoff(ctx, analysisId));
}
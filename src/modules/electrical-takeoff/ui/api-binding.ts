import * as actions from '../actions';
import type { TakeoffClientApi } from '../domain/contracts';
import { wrapTakeoffAction } from './takeoff-action-wrap';

/** Production UI binding: server actions (Agent 5) satisfy `TakeoffClientApi`. */
export function createProductionTakeoffApi(): TakeoffClientApi {
  return {
    listAnalyses: (projectId, options) => wrapTakeoffAction(() => actions.listAnalyses(projectId, options)),
    renameAnalysis: (analysisId, name) => wrapTakeoffAction(() => actions.renameAnalysis(analysisId, name)),
    archiveAnalysis: (analysisId) => wrapTakeoffAction(() => actions.archiveAnalysis(analysisId)),
    restoreAnalysis: (analysisId) => wrapTakeoffAction(() => actions.restoreAnalysis(analysisId)),
    deleteAnalysis: (analysisId) => wrapTakeoffAction(() => actions.deleteAnalysisAction(analysisId)),
    createAnalysis: (projectId, input) => wrapTakeoffAction(() => actions.createAnalysis(projectId, input)),
    getAnalysisView: (analysisId) => wrapTakeoffAction(() => actions.getAnalysisView(analysisId)),
    beginFileUpload: (analysisId, input) => wrapTakeoffAction(() => actions.beginFileUpload(analysisId, input)),
    startAnalysis: (analysisId, input) => wrapTakeoffAction(() => actions.startAnalysis(analysisId, input)),
    getJobProgress: (jobId) => wrapTakeoffAction(() => actions.getJobProgress(jobId)),
    cancelJob: (jobId) => wrapTakeoffAction(() => actions.cancelJob(jobId)),
    applyEdits: (analysisId, edits, expectedRevision) =>
      wrapTakeoffAction(() => actions.applyEdits(analysisId, edits, expectedRevision)),
    approveAnalysis: (analysisId, expectedRevision) =>
      wrapTakeoffAction(() => actions.approveAnalysis(analysisId, expectedRevision)),
    reopenAnalysis: (analysisId, expectedRevision) =>
      wrapTakeoffAction(() => actions.reopenAnalysis(analysisId, expectedRevision)),
    listLibrary: (plannerKey) => wrapTakeoffAction(() => actions.listLibrary(plannerKey)),
    deleteLibraryEntry: (entryId) => wrapTakeoffAction(() => actions.deleteLibraryEntry(entryId)),
    listRuleSets: (projectId) => wrapTakeoffAction(() => actions.listRuleSets(projectId)),
    saveRuleSet: (projectId, ruleSet) => wrapTakeoffAction(() => actions.saveRuleSet(projectId, ruleSet)),
    setAnalysisRuleSet: (analysisId, ruleSetId, expectedRevision) =>
      wrapTakeoffAction(() => actions.setAnalysisRuleSet(analysisId, ruleSetId, expectedRevision)),
    listCatalog: () => wrapTakeoffAction(() => actions.listCatalog()),
    saveCatalogType: (type) => wrapTakeoffAction(() => actions.saveCatalogType(type)),
    createCatalogType: (input) => wrapTakeoffAction(() => actions.createCatalogType(input)),
    updateCatalogType: (input) => wrapTakeoffAction(() => actions.updateCatalogType(input)),
    archiveCatalogType: (input) => wrapTakeoffAction(() => actions.archiveCatalogType(input)),
    requestExport: (analysisId, kind) => wrapTakeoffAction(() => actions.requestExport(analysisId, kind)),
    getTakeoffInputCapabilities: (projectId) =>
      wrapTakeoffAction(() => actions.getTakeoffInputCapabilities(projectId)),
    linkCloudFile: (analysisId, input) =>
      wrapTakeoffAction(() => actions.linkTakeoffCloudFileAction(analysisId, input)),
    purgeEphemeralTakeoff: (analysisId) => wrapTakeoffAction(() => actions.purgeEphemeralTakeoffAction(analysisId)),
  };
}
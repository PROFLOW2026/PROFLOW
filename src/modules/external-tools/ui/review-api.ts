import type {
  AnalysisView,
  CatalogType,
  MeasurementRuleSet,
  SymbolLibraryEntry,
  TakeoffClientApi,
  TakeoffEdit,
} from '@/modules/electrical-takeoff/domain/contracts';

async function readView(sessionId: string): Promise<AnalysisView> {
  const response = await fetch(`/api/tools/external/sessions/${sessionId}/review`);
  if (!response.ok) throw new Error('result_missing');
  return (await response.json()) as AnalysisView;
}

/** The existing review screen, pointed at one external session. Library writes stay closed. */
export function externalReviewApi(sessionId: string): TakeoffClientApi {
  const unavailable = (): Promise<never> => Promise.reject(new Error('external_tool_library_closed'));
  return {
    listAnalyses: async () => [],
    renameAnalysis: async () => undefined,
    archiveAnalysis: async () => undefined,
    restoreAnalysis: async () => undefined,
    deleteAnalysis: async () => undefined,
    createAnalysis: unavailable,
    getAnalysisView: () => readView(sessionId),
    getTakeoffInputCapabilities: async () => ({ persistenceDefault: 'ephemeral', canPickFromProjectCloud: false }),
    beginFileUpload: unavailable,
    linkCloudFile: unavailable,
    purgeEphemeralTakeoff: async () => {
      const response = await fetch(`/api/tools/external/sessions/${sessionId}/close`, { method: 'POST' });
      if (!response.ok) throw new Error('close_failed');
    },
    startAnalysis: unavailable,
    getJobProgress: unavailable,
    cancelJob: async () => {
      const response = await fetch(`/api/tools/external/sessions/${sessionId}/cancel`, { method: 'POST' });
      if (!response.ok) throw new Error('cancel_failed');
    },
    applyEdits: async (_analysisId: string, edits: TakeoffEdit[], expectedRevision: number) => {
      for (const [index, op] of edits.entries()) {
        const response = await fetch(`/api/tools/external/sessions/${sessionId}/edits`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ seq: expectedRevision + index, expectedRevision: expectedRevision + index, op }),
        });
        if (response.status === 409) throw new Error('revision_conflict');
        if (!response.ok) throw new Error('edit_failed');
      }
      return readView(sessionId);
    },
    approveAnalysis: async () => {
      const response = await fetch(`/api/tools/external/sessions/${sessionId}/review`, { method: 'POST' });
      if (!response.ok) throw new Error('review_failed');
      return readView(sessionId);
    },
    reopenAnalysis: async (_analysisId: string, expectedRevision: number) => {
      const response = await fetch(`/api/tools/external/sessions/${sessionId}/edits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seq: expectedRevision, expectedRevision, op: { op: 'note', text: 'reopen' } }),
      });
      if (!response.ok) throw new Error('reopen_failed');
      return readView(sessionId);
    },
    listLibrary: async () => [] as SymbolLibraryEntry[],
    deleteLibraryEntry: unavailable,
    listRuleSets: async () => [] as MeasurementRuleSet[],
    saveRuleSet: unavailable,
    setAnalysisRuleSet: () => readView(sessionId),
    listCatalog: async () => [] as CatalogType[],
    saveCatalogType: unavailable,
    createCatalogType: unavailable,
    updateCatalogType: unavailable,
    archiveCatalogType: unavailable,
    requestExport: async (_analysisId: string, kind: 'xlsx' | 'boq-pdf' | 'annotated-pdf') => {
      const fileName = kind === 'xlsx' ? 'external-boq.xlsx' : kind === 'boq-pdf' ? 'external-boq.pdf' : 'external-annotated.pdf';
      return { url: `/api/tools/external/sessions/${sessionId}/export?format=${kind}`, fileName };
    },
  };
}

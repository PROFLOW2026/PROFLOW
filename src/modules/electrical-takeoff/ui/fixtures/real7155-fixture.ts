import workerJson from './real7155-worker.json';
import {
  REAL7155_ANALYSIS_ID,
  buildAnalysisViewFromWorkerResult,
  parseWorkerResultJson,
} from './build-real7155-view';

export { REAL7155_ANALYSIS_ID };

let cached: ReturnType<typeof buildAnalysisViewFromWorkerResult> | null = null;

/** Lazily build the 7155 corpus view from checked-in worker JSON (dev mock). */
export function getReal7155Fixture() {
  if (!cached) {
    const result = parseWorkerResultJson(workerJson);
    cached = buildAnalysisViewFromWorkerResult(result, {
      analysisId: REAL7155_ANALYSIS_ID,
      name: '7155 תאורה ג — worker אמיתי',
    });
  }
  return cached;
}
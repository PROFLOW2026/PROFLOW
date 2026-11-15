import { PINS_ANALYSIS_ID, buildPinsAnalysisView } from './build-pins-view';

export { PINS_ANALYSIS_ID };

let cached: ReturnType<typeof buildPinsAnalysisView> | null = null;

/** Pins floors 3–4 proof sheet: real preview raster plus the 74 engine plan marks. */
export function getPinsFixture() {
  if (!cached) cached = buildPinsAnalysisView();
  return cached;
}

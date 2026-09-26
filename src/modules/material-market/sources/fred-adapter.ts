import type { MonthlySeries } from '../domain/types';
import type { MaterialMarketSourceAdapter } from './types';

const USER_AGENT = 'ProjectFlow-MaterialMarket/1.0';

function parseFredCsv(text: string, startYm: string): MonthlySeries {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};
  if (lines[0]!.split(',').length < 2) return {};
  const out: MonthlySeries = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    const rawDate = cols[0];
    const rawVal = cols[1];
    if (!rawDate || !rawVal || rawVal === '.' || rawVal === '') continue;
    const ym = rawDate.slice(0, 7);
    if (ym < startYm) continue;
    out[ym] = Number.parseFloat(rawVal);
  }
  return out;
}

export function createFredAdapter(
  code: string,
  seriesId: string,
  startYm = '2016-01',
): MaterialMarketSourceAdapter {
  return {
    code,
    async fetchRange(fromYm, toYm) {
      const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        throw new Error(`FRED ${seriesId} HTTP ${response.status}`);
      }
      const text = await response.text();
      const series = parseFredCsv(text, startYm);
      const filtered: MonthlySeries = {};
      for (const [ym, value] of Object.entries(series)) {
        if (ym >= fromYm && ym <= toYm) filtered[ym] = value;
      }
      return filtered;
    },
  };
}

/** Exported for unit tests with fixture CSV text. */
export function parseFredCsvForTest(text: string, startYm = '2016-01'): MonthlySeries {
  return parseFredCsv(text, startYm);
}

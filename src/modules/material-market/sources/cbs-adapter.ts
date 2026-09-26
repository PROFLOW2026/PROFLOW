import type { MonthlySeries } from '../domain/types';
import type { MaterialMarketSourceAdapter } from './types';

const USER_AGENT = 'ProjectFlow-MaterialMarket/1.0';

interface CbsResponse {
  month?: Array<{
    date?: Array<{
      year: number;
      month: number;
      currBase?: { value?: number | string };
    }>;
  }>;
}

export function createCbsAdapter(
  code: string,
  cbsId: string,
  startYm = '2016-01',
): MaterialMarketSourceAdapter {
  return {
    code,
    async fetchRange(fromYm, toYm) {
      const url = `https://api.cbs.gov.il/index/data/price?id=${cbsId}&format=json&startPeriod=01-2010&endPeriod=12-2026`;
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        throw new Error(`CBS ${cbsId} HTTP ${response.status}`);
      }
      const data = (await response.json()) as CbsResponse;
      const out: MonthlySeries = {};
      for (const block of data.month ?? []) {
        for (const obs of block.date ?? []) {
          const val = obs.currBase?.value;
          if (val == null) continue;
          const ym = `${obs.year.toString().padStart(4, '0')}-${obs.month.toString().padStart(2, '0')}`;
          if (ym < startYm || ym < fromYm || ym > toYm) continue;
          out[ym] = typeof val === 'number' ? val : Number.parseFloat(String(val));
        }
      }
      return out;
    },
  };
}

/** Exported for unit tests with fixture JSON. */
export function parseCbsJsonForTest(
  data: CbsResponse,
  startYm = '2016-01',
  fromYm = startYm,
  toYm = '2099-12',
): MonthlySeries {
  const out: MonthlySeries = {};
  for (const block of data.month ?? []) {
    for (const obs of block.date ?? []) {
      const val = obs.currBase?.value;
      if (val == null) continue;
      const ym = `${obs.year.toString().padStart(4, '0')}-${obs.month.toString().padStart(2, '0')}`;
      if (ym < startYm || ym < fromYm || ym > toYm) continue;
      out[ym] = typeof val === 'number' ? val : Number.parseFloat(String(val));
    }
  }
  return out;
}

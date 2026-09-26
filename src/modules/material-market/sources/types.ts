import type { MonthlySeries } from '../domain/types';

export interface MaterialMarketSourceAdapter {
  readonly code: string;
  fetchRange(fromYm: string, toYm: string): Promise<MonthlySeries>;
}

export interface ObservationPoint {
  date: string;
  value: number;
}

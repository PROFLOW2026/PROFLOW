import type { BusinessDate } from '@/shared/dates';

export interface ActiveClaimCashProjectionRow {
  readonly id: string;
  readonly mappingId: string;
  readonly contractorProjectId: string;
  readonly developerClaimId: string;
  readonly developerPayableBasisId: string;
  readonly certifiedNet: string;
  readonly retentionNet: string;
  readonly currency: string;
  readonly expectedReceiptDate: BusinessDate | null;
  readonly certainty: 'confirmed' | 'estimated';
  readonly sourceVersion: number;
}

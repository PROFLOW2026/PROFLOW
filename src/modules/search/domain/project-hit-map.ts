/**
 * Maps project-search rows onto global search hits.
 * Money is copied only when the caller already decided the viewer may see it
 * on that project. Operational hits never carry amount or currency.
 */

import {
  claimSearchHref,
  contractorSearchHref,
  coordinationEventSearchHref,
  defectSearchHref,
  drawingSearchHref,
  locationSearchHref,
  meetingSearchHref,
  rfiSearchHref,
  deliverySearchHref,
  inspectionSearchHref,
  safetySearchHref,
  siteInstructionSearchHref,
  submittalSearchHref,
  tenderSearchHref,
} from './hrefs';
import type { GlobalSearchHit, GlobalSearchKind } from './types';

export interface MoneyFields {
  readonly amount?: string | null;
  readonly currency?: string | null;
}

export function applySearchMoney(
  hit: GlobalSearchHit,
  includeMoney: boolean,
  money?: MoneyFields | null,
): GlobalSearchHit {
  if (!includeMoney || !money?.amount || !money.currency) {
    if (hit.amount == null && hit.currency == null) return hit;
    const { amount: _amount, currency: _currency, ...safe } = hit;
    return safe;
  }
  return { ...hit, amount: money.amount, currency: money.currency };
}

function labeledHit(
  kind: GlobalSearchKind,
  id: string,
  title: string,
  href: string,
  status: string | null,
  contextLabel: string | null,
  date?: string | null,
): GlobalSearchHit {
  return {
    kind,
    id,
    title,
    subtitle: null,
    href,
    status,
    contextLabel,
    date: date ?? null,
  };
}

function joinContext(parts: readonly (string | null | undefined)[]): string | null {
  const text = parts.map((part) => part?.trim()).filter(Boolean).join(' · ');
  return text || null;
}

export interface ContractorSearchRow extends MoneyFields {
  readonly agreementId: string;
  readonly projectId: string;
  readonly vendorName: string;
  readonly agreementTitle: string;
  readonly status: string;
  readonly projectName: string | null;
}

export function mapContractorSearchHit(row: ContractorSearchRow, includeMoney: boolean): GlobalSearchHit {
  return applySearchMoney(
    labeledHit(
      'contractor',
      row.agreementId,
      row.vendorName,
      contractorSearchHref(row.projectId, row.agreementId),
      row.status,
      joinContext([row.agreementTitle, row.projectName]),
    ),
    includeMoney,
    row,
  );
}

export interface CoordinationSearchRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: string;
  readonly projectName: string | null;
  readonly startsOn: string | null;
}

export function mapCoordinationSearchHit(row: CoordinationSearchRow): GlobalSearchHit {
  return labeledHit(
    'coordination_event',
    row.id,
    row.title,
    coordinationEventSearchHref(row.projectId, row.id),
    row.status,
    row.projectName,
    row.startsOn,
  );
}

export interface ClaimSearchRow extends MoneyFields {
  readonly id: string;
  readonly projectId: string;
  readonly claimNumber: number;
  readonly title: string | null;
  readonly status: string;
  readonly projectName: string | null;
  readonly periodStart: string | null;
}

export function mapClaimSearchHit(row: ClaimSearchRow, includeMoney: boolean): GlobalSearchHit {
  const title = row.title?.trim() || `#${row.claimNumber}`;
  return applySearchMoney(
    labeledHit(
      'claim',
      row.id,
      title,
      claimSearchHref(row.projectId, row.id),
      row.status,
      row.projectName,
      row.periodStart,
    ),
    includeMoney,
    row,
  );
}

export interface NumberedSearchRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly numberLabel: string | null;
  readonly status: string;
  readonly projectName: string | null;
}

export function mapRfiSearchHit(row: NumberedSearchRow): GlobalSearchHit {
  return labeledHit('rfi', row.id, row.title, rfiSearchHref(row.projectId, row.id), row.status, joinContext([row.numberLabel, row.projectName]));
}

export function mapSubmittalSearchHit(row: NumberedSearchRow): GlobalSearchHit {
  return labeledHit(
    'submittal',
    row.id,
    row.title,
    submittalSearchHref(row.projectId, row.id),
    row.status,
    joinContext([row.numberLabel, row.projectName]),
  );
}

export function mapDefectSearchHit(row: NumberedSearchRow): GlobalSearchHit {
  return labeledHit(
    'defect',
    row.id,
    row.title,
    defectSearchHref(row.projectId, row.id),
    row.status,
    joinContext([row.numberLabel, row.projectName]),
  );
}

export interface DrawingSearchRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly drawingNumber: string;
  readonly status: string;
  readonly projectName: string | null;
}

export function mapDrawingSearchHit(row: DrawingSearchRow): GlobalSearchHit {
  return labeledHit(
    'drawing',
    row.id,
    row.title,
    drawingSearchHref(row.projectId, row.id),
    row.status,
    joinContext([row.drawingNumber, row.projectName]),
  );
}

export interface LocationSearchRow {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly code: string | null;
  readonly projectName: string | null;
}

export function mapLocationSearchHit(row: LocationSearchRow): GlobalSearchHit {
  return labeledHit(
    'location',
    row.id,
    row.name,
    locationSearchHref(row.projectId),
    null,
    joinContext([row.code, row.projectName]),
  );
}

export interface MeetingSearchRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: string;
  readonly projectName: string | null;
  readonly scheduledOn: string | null;
}

export function mapMeetingSearchHit(row: MeetingSearchRow): GlobalSearchHit {
  return labeledHit(
    'meeting',
    row.id,
    row.title,
    meetingSearchHref(row.projectId, row.id),
    row.status,
    row.projectName,
    row.scheduledOn,
  );
}

export interface InstructionSearchRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly numberLabel: string | null;
  readonly status: string;
  readonly projectName: string | null;
}

export function mapInstructionSearchHit(row: InstructionSearchRow): GlobalSearchHit {
  return labeledHit(
    'site_instruction',
    row.id,
    row.title,
    siteInstructionSearchHref(row.projectId, row.id),
    row.status,
    joinContext([row.numberLabel, row.projectName]),
  );
}

export function mapInspectionSearchHit(row: NumberedSearchRow): GlobalSearchHit {
  return labeledHit(
    'inspection',
    row.id,
    row.title,
    inspectionSearchHref(row.projectId, row.id),
    row.status,
    joinContext([row.numberLabel, row.projectName]),
  );
}

export function mapDeliverySearchHit(row: NumberedSearchRow): GlobalSearchHit {
  return labeledHit('delivery', row.id, row.title, deliverySearchHref(row.projectId), row.status, row.projectName);
}

export function mapTenderSearchHit(row: NumberedSearchRow): GlobalSearchHit {
  return labeledHit(
    'tender',
    row.id,
    row.title,
    tenderSearchHref(row.projectId, row.id),
    row.status,
    joinContext([row.numberLabel, row.projectName]),
  );
}

export function mapSafetySearchHit(row: NumberedSearchRow): GlobalSearchHit {
  return labeledHit('safety', row.id, row.title, safetySearchHref(row.projectId), row.status, row.projectName);
}

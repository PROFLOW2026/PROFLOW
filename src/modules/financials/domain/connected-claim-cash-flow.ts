import { isPositiveMoney, isZeroMoney, money } from '@/shared/money';
import type { CertifiedReceiptForecastEntry } from '@/modules/subcontract-claims/domain/certified-receipt-cash-flow';
import type { ActiveClaimCashProjectionRow } from '@/modules/connected-projects';
import {
  certaintyForDatedSource,
  type CashFlowForecastItem,
  type CashFlowSourceType,
} from './cash-flow-forecast';

function projectionSourceType(line: 'payable' | 'retention'): CashFlowSourceType {
  return line === 'retention' ? 'retention_release_in' : 'certified_subcontract_receipt';
}

function projectionHref(projectId: string, projectionId: string): string {
  return `/projects/${projectId}/financials?connectedClaimProjection=${projectionId}`;
}

/**
 * Maps contractor-org projection rows into forecast drilldown items (incoming only).
 * Does not read developer AP — avoids double-counting developer-side subcontract outflows.
 */
export function connectedClaimProjectionCashItems(
  rows: readonly ActiveClaimCashProjectionRow[],
  currency: string,
): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const row of rows) {
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;

    if (isPositiveMoney(money(row.certifiedNet, row.currency))) {
      const dueDate = row.expectedReceiptDate;
      items.push({
        id: `connected-claim:${row.id}:payable`,
        href: projectionHref(row.contractorProjectId, row.id),
        label: `Certified claim (${row.developerClaimId.slice(0, 8)})`,
        amount: money(row.certifiedNet, row.currency),
        dueDate,
        certainty:
          row.certainty === 'confirmed'
            ? certaintyForDatedSource({ dueDate, recorded: true })
            : certaintyForDatedSource({ dueDate, recorded: false }),
        direction: 'in',
        sourceType: projectionSourceType('payable'),
        projectId: row.contractorProjectId,
      });
    }

    if (isPositiveMoney(money(row.retentionNet, row.currency))) {
      items.push({
        id: `connected-claim:${row.id}:retention`,
        href: projectionHref(row.contractorProjectId, row.id),
        label: `Retention hold (${row.developerClaimId.slice(0, 8)})`,
        amount: money(row.retentionNet, row.currency),
        dueDate: null,
        certainty: 'uncertain',
        direction: 'in',
        sourceType: projectionSourceType('retention'),
        projectId: row.contractorProjectId,
      });
    }
  }
  return items.filter((item) => !isZeroMoney(item.amount));
}

export function certifiedReceiptCashItems(input: {
  readonly entries: readonly CertifiedReceiptForecastEntry[];
  readonly currency: string;
  readonly hrefForClaim: (projectId: string, claimId: string) => string;
}): CashFlowForecastItem[] {
  const items: CashFlowForecastItem[] = [];
  for (const entry of input.entries) {
    for (const line of entry.lines) {
      if (line.amount.currency.toUpperCase() !== input.currency.toUpperCase()) continue;
      if (isZeroMoney(line.amount)) continue;
      const labelBase =
        entry.facts.agreementTitle?.trim() ||
        `Claim #${entry.facts.claimNumber}`;
      items.push({
        id: `dev-claim:${entry.facts.payableBasisId}:${line.lineKey}`,
        href: input.hrefForClaim(entry.facts.projectId, entry.facts.claimId),
        label: line.lineKey === 'retention' ? `${labelBase} · retention` : labelBase,
        amount: line.amount,
        dueDate: line.dueDate,
        certainty: line.certainty,
        direction: 'in',
        sourceType: projectionSourceType(line.lineKey),
        projectId: entry.facts.projectId,
      });
    }
  }
  return items;
}

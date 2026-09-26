import { listBillingRecords, listPaymentApplications } from '@/modules/billing';
import {
  computeClientReceivablesSnapshot,
  type ClientReceivablesSnapshot,
} from '@/modules/billing/domain/client-receivables';
import type { BillingRecordSummary, PaymentApplicationRow } from '@/modules/billing/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getClientById } from './list-clients';

const AR_LIST_LIMIT = 5_000;
const RECENT_LIMIT = 8;
const SECTION_LIMIT = 20;

export interface ClientFinancialView {
  readonly snapshot: ClientReceivablesSnapshot;
  readonly recentBilling: readonly BillingRecordSummary[];
  /** Unpaid and not yet past due (`open` or `partial`). */
  readonly openBilling: readonly BillingRecordSummary[];
  /** Past-due unpaid records. Totals on the snapshot include every record. */
  readonly overdueBilling: readonly BillingRecordSummary[];
  readonly recentPayments: readonly PaymentApplicationRow[];
}

/**
 * Owner-facing client AR from billing records linked to this client
 * (`billing.clientId` or the project's `clientId`). Requires BILLING_READ.
 */
export async function getClientFinancials(
  context: OrgContext,
  clientId: string,
): Promise<ClientFinancialView> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  await getClientById(context, clientId);

  const asOf = todayInTimeZone(context.organization.timezone);
  const currency = context.organization.baseCurrency;

  const [records, payments] = await Promise.all([
    listBillingRecords(context, { clientId, filter: 'all', limit: AR_LIST_LIMIT }),
    listPaymentApplications(context, { clientId, limit: RECENT_LIMIT }),
  ]);

  const { openBilling, overdueBilling } = partitionClientBilling(records);

  return {
    snapshot: computeClientReceivablesSnapshot(records, currency, asOf),
    recentBilling: records.slice(0, RECENT_LIMIT),
    openBilling,
    overdueBilling,
    recentPayments: payments,
  };
}

function partitionClientBilling(records: readonly BillingRecordSummary[]): {
  openBilling: BillingRecordSummary[];
  overdueBilling: BillingRecordSummary[];
} {
  const openBilling: BillingRecordSummary[] = [];
  const overdueBilling: BillingRecordSummary[] = [];

  for (const record of records) {
    if (record.collectionStatus === 'overdue') overdueBilling.push(record);
    else if (record.collectionStatus === 'open' || record.collectionStatus === 'partial') {
      openBilling.push(record);
    }
  }

  overdueBilling.sort((left, right) => {
    if (left.dueDate && right.dueDate) {
      if (left.dueDate < right.dueDate) return -1;
      if (left.dueDate > right.dueDate) return 1;
      return 0;
    }
    if (left.dueDate) return -1;
    if (right.dueDate) return 1;
    return 0;
  });

  return {
    openBilling: openBilling.slice(0, SECTION_LIMIT),
    overdueBilling: overdueBilling.slice(0, SECTION_LIMIT),
  };
}

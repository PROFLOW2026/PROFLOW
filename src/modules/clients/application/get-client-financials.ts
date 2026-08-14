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

export interface ClientFinancialView {
  readonly snapshot: ClientReceivablesSnapshot;
  readonly recentBilling: readonly BillingRecordSummary[];
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

  return {
    snapshot: computeClientReceivablesSnapshot(records, currency, asOf),
    recentBilling: records.slice(0, RECENT_LIMIT),
    recentPayments: payments,
  };
}

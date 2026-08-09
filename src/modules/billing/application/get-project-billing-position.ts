import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import type { BillingPosition } from '@/modules/financials/domain/types';
import { fromNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { aggregateBillingPositionInCurrency } from '../domain/outstanding';
import {
  findProjectInOrganization,
  listProjectBillingAmountRows,
} from '../data/billing.repository';

export async function getProjectBillingPosition(
  context: OrgContext,
  projectId: string,
): Promise<BillingPosition> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const currency = (project.currency ?? context.organization.baseCurrency).toUpperCase();
  const rows = await listProjectBillingAmountRows(context.db, context.organizationId, projectId);

  const { invoiced, paid, outstanding } = aggregateBillingPositionInCurrency(
    rows.map((row) => ({
      kind: row.kind,
      status: row.status,
      totalAmount: fromNumericString(row.totalAmount, row.currency)!,
      payments: row.payments.map((payment) => ({
        amount: fromNumericString(payment.amount, payment.currency)!,
        status: payment.status,
      })),
    })),
    currency,
  );

  return { invoiced, paid, outstanding };
}

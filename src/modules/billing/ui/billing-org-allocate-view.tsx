import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listBillingRecords } from '@/modules/billing';
import { getPaymentAllocationView } from '@/modules/billing/application/get-payment-allocation-view';
import { AllocatePaymentForm } from '@/modules/billing/ui/allocate-payment-form';
import {
  orgListHasPermission,
  type OrgListSurface,
} from '@/modules/employee-app/application/org-list-permissions';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { withOrgContext } from '@/shared/auth/session';
import { NotFoundError } from '@/shared/errors';
import { isPositiveMoney } from '@/shared/money';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  allocateEmployeePaymentAction,
  allocatePaymentAction,
} from '@/modules/billing/ui/actions';

interface BillingOrgAllocateViewProps {
  readonly paymentId: string;
  readonly routeBase: string;
  readonly surface?: OrgListSurface;
}

export async function BillingOrgAllocateView({
  paymentId,
  routeBase: _routeBase,
  surface = 'owner',
}: BillingOrgAllocateViewProps) {
  const t = await getTranslations('billing');

  let payment;
  let records;
  let canManage = false;
  try {
    const loaded = await withOrgContext(async (context) => {
      if (surface === 'employee') {
        await assertEmployeeAppContext(context);
      }
      if (!orgListHasPermission(context, PERMISSIONS.BILLING_MANAGE, surface)) {
        throw new NotFoundError('Payment not found');
      }
      const [paymentView, billingRecords] = await Promise.all([
        getPaymentAllocationView(context, paymentId),
        listBillingRecords(context, { filter: 'all', limit: 500 }),
      ]);
      return { payment: paymentView, records: billingRecords, canManage: true };
    });
    payment = loaded.payment;
    records = loaded.records;
    canManage = loaded.canManage;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  if (!canManage) notFound();

  const allocateAction =
    surface === 'employee' ? allocateEmployeePaymentAction : allocatePaymentAction;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('paymentForm.allocateTitle')}
        description={
          isPositiveMoney(payment.unallocatedAmount)
            ? t('paymentForm.allocateHint')
            : t('paymentForm.fullyAllocatedHint')
        }
      />
      {isPositiveMoney(payment.unallocatedAmount) ? (
        <AllocatePaymentForm
          payment={payment}
          billingRecords={records}
          allocateAction={allocateAction.bind(null, paymentId)}
        />
      ) : (
        <div className="rounded-lg border border-[var(--pf-border-default)] p-4 text-sm">
          <p>
            {t('paymentForm.cashReceivedPreview')}: {payment.amount.amount}{' '}
            {payment.amount.currency}
          </p>
          <p className="mt-1">
            {t('paymentForm.allocatedPreview')}: {payment.appliedAmount.amount}{' '}
            {payment.appliedAmount.currency}
          </p>
          <p className="mt-1">{t('paymentForm.fullyAllocatedHint')}</p>
        </div>
      )}
    </div>
  );
}

import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
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
import { Link } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

const EMPTY = '—';

interface BillingOrgAllocateViewProps {
  readonly paymentId: string;
  readonly routeBase: string;
  readonly surface?: OrgListSurface;
}

export async function BillingOrgAllocateView({
  paymentId,
  routeBase,
  surface = 'owner',
}: BillingOrgAllocateViewProps) {
  const [t, locale] = await Promise.all([getTranslations('billing'), getLocale()]);

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

  const hasUnallocated = isPositiveMoney(payment.unallocatedAmount);

  return (
    <MainAppPage>
      <PageHeader
        title={payment.reference?.trim() ? payment.reference : t('paymentForm.allocateTitle')}
        description={
          hasUnallocated ? t('paymentForm.allocateHint') : t('paymentForm.fullyAllocatedHint')
        }
        breadcrumb={
          <Link href={routeBase} className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        meta={
          payment.clientName ? (
            <span className="text-sm text-[var(--pf-text-secondary)]">{payment.clientName}</span>
          ) : null
        }
      />

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('paymentForm.client')}>
            {payment.clientName ?? EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('paymentForm.paymentDate')}>
            <span dir="ltr">{formatBusinessDate(payment.paymentDate, locale)}</span>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('paymentForm.method')}>
            {payment.method?.trim() ? payment.method : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('paymentForm.reference')}>
            {payment.reference?.trim() ? (
              <span className="pf-ltr-island" dir="ltr">
                {payment.reference}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('paymentForm.cashReceivedPreview')}>
            <MoneyText value={payment.amount} className="font-semibold" />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('paymentForm.allocatedPreview')}>
            <MoneyText value={payment.appliedAmount} className="font-semibold" />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('paymentForm.unallocatedPreview')}>
            <MoneyText
              value={payment.unallocatedAmount}
              className="font-semibold"
              colorizeNegative
            />
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {payment.notes?.trim() ? (
          <p className="mt-3 whitespace-pre-wrap text-start text-sm text-[var(--pf-text-secondary)]">
            {payment.notes}
          </p>
        ) : null}
      </MainAppSection>

      <MainAppSection title={hasUnallocated ? t('paymentForm.allocations') : undefined}>
        {hasUnallocated ? (
          <AllocatePaymentForm
            payment={payment}
            billingRecords={records}
            allocateAction={allocateAction.bind(null, paymentId)}
          />
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('paymentForm.fullyAllocatedHint')}
          </p>
        )}
      </MainAppSection>
    </MainAppPage>
  );
}

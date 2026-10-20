import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import {
  getVendorCreditDetail,
  isRecognizedVendorBillStatus,
  listApBillsForOrg,
  type ApCreditLifecycleDisplayStatus,
} from '@/modules/ap';
import { compareMoney, money, zeroMoney } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { ApBillTaxSummary } from '@/modules/ap/ui/ap-bill-tax-summary';
import {
  ApplyVendorCreditForm,
  EditDraftCreditForm,
  PostVendorCreditPanel,
  VoidVendorCreditPanel,
} from './credit-lifecycle-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('credits.detail.title') };
}

const EMPTY = '—';

function creditStatusShape(status: ApCreditLifecycleDisplayStatus): StatusShape {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'pending_approval':
      return 'pending';
    case 'open':
      return 'active';
    case 'applied':
      return 'completed';
    case 'void':
      return 'void';
    default:
      return 'archived';
  }
}

function lifecycleHintKey(
  status: ApCreditLifecycleDisplayStatus,
): 'pendingApproval' | 'draftHint' | 'openHint' | 'appliedHint' | 'voidHint' {
  switch (status) {
    case 'pending_approval':
      return 'pendingApproval';
    case 'draft':
      return 'draftHint';
    case 'open':
      return 'openHint';
    case 'applied':
      return 'appliedHint';
    case 'void':
      return 'voidHint';
  }
}

export default async function VendorCreditDetailPage({
  params,
}: {
  params: Promise<{ creditId: string }>;
}) {
  const { creditId } = await params;
  const t = await getTranslations('ap');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.AP_READ)) return null;
    const detail = await getVendorCreditDetail(context, creditId);
    if (!detail) return null;

    const canManage = hasPermission(context, PERMISSIONS.AP_MANAGE);
    const bills = canManage ? await listApBillsForOrg(context) : [];
    const payableBills = bills
      .filter(
        (bill) =>
          bill.vendorId === detail.credit.vendorId && isRecognizedVendorBillStatus(bill.status),
      )
      .map((bill) => ({
        id: bill.id,
        label: bill.reference?.trim() || bill.id.slice(0, 8),
      }));

    return { ...detail, canManage, payableBills };
  });

  if (!data) notFound();

  const {
    credit,
    applications,
    remaining,
    appliedTotal,
    displayStatus,
    canManage,
    payableBills,
  } = data;

  const isDraft = credit.status === 'draft';
  const isOpen = credit.status === 'open';
  const isVoid = credit.status === 'void';
  const hasRemaining =
    compareMoney(money(remaining, credit.currency), zeroMoney(credit.currency)) > 0;

  return (
    <MainAppPage>
      <PageHeader
        title={credit.reference?.trim() || t('credits.list.noReference')}
        description={t('credits.detail.description')}
        breadcrumb={
          <Link href="/procurement/ap/credits" className={textNavLinkMutedClassName}>
            {t('credits.listTitle')}
          </Link>
        }
        meta={
          <StatusBadge
            shape={creditStatusShape(displayStatus)}
            label={t(`credits.statuses.${displayStatus}` as 'credits.statuses.open')}
          />
        }
      />
      <MainAppSection>
        <Alert tone={displayStatus === 'pending_approval' ? 'warning' : 'info'}>
          {t(`credits.detail.${lifecycleHintKey(displayStatus)}`)}
        </Alert>

        <ApBillTaxSummary
          netAmount={credit.netAmount ?? credit.amount}
          taxAmount={credit.taxAmount ?? '0'}
          grossAmount={credit.grossAmount ?? credit.amount}
          currency={credit.currency}
          taxBasis={credit.taxBasis}
        />

        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('credits.detail.amount')}>
            <MoneyText value={money(credit.amount, credit.currency)} />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('credits.detail.applied')}>
            <MoneyText value={money(appliedTotal, credit.currency)} />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('credits.detail.remaining')}>
            <MoneyText value={money(remaining, credit.currency)} />
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('credits.detail.creditDate')}>
            <span dir="ltr" className="pf-ltr-island">
              {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                new Date(credit.creditDate),
              )}
            </span>
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('credits.detail.vendor')}>
            {credit.vendorName?.trim() ? credit.vendorName : EMPTY}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>

        {credit.notes ? (
          <p className="min-w-0 break-words text-sm text-[var(--pf-text-secondary)]">
            {credit.notes}
          </p>
        ) : null}
      </MainAppSection>

      <MainAppSection title={t('credits.detail.applicationsTitle')}>
        {applications.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">
            {t('credits.detail.applicationsEmpty')}
          </p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2">
            {applications.map((row) => (
              <li
                key={row.application.id}
                className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-words">
                  <Link
                    href={`/procurement/ap/${row.application.apBillId}`}
                    className={cn(textNavLinkClassName, 'rounded-sm')}
                  >
                    {t('credits.detail.billLink')}:{' '}
                    {row.billReference?.trim() || row.application.apBillId.slice(0, 8)}
                  </Link>
                  {' · '}
                  {row.application.status === 'applied'
                    ? t('credits.detail.applicationStatusApplied')
                    : t('credits.detail.applicationStatusVoid')}
                </span>
                <MoneyText value={money(row.application.amount, row.application.currency)} />
              </li>
            ))}
          </ul>
        )}
      </MainAppSection>

      {canManage && isDraft ? (
        <MainAppSection>
          <EditDraftCreditForm
            creditId={credit.id}
            amount={credit.amount}
            creditDate={credit.creditDate}
            reference={credit.reference}
            notes={credit.notes}
          />
        </MainAppSection>
      ) : null}

      {canManage ? (
        <MainAppSection>
          <PostVendorCreditPanel creditId={credit.id} displayStatus={displayStatus} />
        </MainAppSection>
      ) : null}

      {canManage && isOpen && hasRemaining ? (
        <MainAppSection>
          <ApplyVendorCreditForm
            creditId={credit.id}
            remaining={remaining}
            currency={credit.currency}
            bills={payableBills}
          />
        </MainAppSection>
      ) : null}

      {canManage && !isVoid ? (
        <MainAppSection>
          <VoidVendorCreditPanel creditId={credit.id} />
        </MainAppSection>
      ) : null}
    </MainAppPage>
  );
}

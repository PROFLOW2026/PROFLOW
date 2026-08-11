import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
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
    <div className="flex min-w-0 flex-col gap-6">
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

      <Alert tone={displayStatus === 'pending_approval' ? 'warning' : 'info'}>
        {t(`credits.detail.${lifecycleHintKey(displayStatus)}`)}
      </Alert>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('credits.detail.amount')}</p>
          <MoneyText value={money(credit.amount, credit.currency)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('credits.detail.applied')}</p>
          <MoneyText value={money(appliedTotal, credit.currency)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('credits.detail.remaining')}</p>
          <MoneyText value={money(remaining, credit.currency)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('credits.detail.creditDate')}</p>
          <p dir="ltr">
            {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(credit.creditDate),
            )}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <p className="min-w-0 break-words text-sm">
          <span className="text-[var(--pf-text-muted)]">{t('credits.detail.vendor')}: </span>
          {credit.vendorName ?? '—'}
        </p>
        {credit.notes ? (
          <p className="min-w-0 break-words text-sm">
            <span className="text-[var(--pf-text-muted)]">{t('credits.detail.notes')}: </span>
            {credit.notes}
          </p>
        ) : null}
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="text-sm font-semibold">{t('credits.detail.applicationsTitle')}</h2>
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
      </section>

      {canManage && isDraft ? (
        <EditDraftCreditForm
          creditId={credit.id}
          amount={credit.amount}
          creditDate={credit.creditDate}
          reference={credit.reference}
          notes={credit.notes}
        />
      ) : null}

      {canManage ? (
        <PostVendorCreditPanel creditId={credit.id} displayStatus={displayStatus} />
      ) : null}

      {canManage && isOpen && hasRemaining ? (
        <ApplyVendorCreditForm
          creditId={credit.id}
          remaining={remaining}
          currency={credit.currency}
          bills={payableBills}
        />
      ) : null}

      {canManage && !isVoid ? <VoidVendorCreditPanel creditId={credit.id} /> : null}
    </div>
  );
}

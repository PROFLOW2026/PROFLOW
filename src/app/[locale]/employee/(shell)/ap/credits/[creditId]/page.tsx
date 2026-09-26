import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { getVendorCreditDetail, type ApCreditLifecycleDisplayStatus } from '@/modules/ap';
import { withOrgContext } from '@/shared/auth/session';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { money } from '@/shared/money/money';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function creditStatusShape(status: string): StatusShape {
  switch (status as ApCreditLifecycleDisplayStatus) {
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

export default async function EmployeeApCreditDetailPage({
  params,
}: {
  params: Promise<{ creditId: string }>;
}) {
  const { creditId } = await params;
  const t = await getTranslations('employeeApp.ap');
  const tAp = await getTranslations('ap');
  const locale = await getLocale();

  const detail = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.AP_READ)) return null;
    return getVendorCreditDetail(context, creditId);
  });

  if (!detail) notFound();

  const { credit } = detail;

  return (
    <div className="space-y-4">
      <Link
        href="/employee/ap/credits"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('credits.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">
          {credit.reference?.trim() || tAp('credits.list.noReference')}
        </h1>
        <StatusBadge
          shape={creditStatusShape(detail.displayStatus)}
          label={tAp(`credits.statuses.${detail.displayStatus}` as 'credits.statuses.open')}
        />
      </div>
      <p className="text-sm">{credit.vendorName ?? '—'}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{tAp('credits.list.columns.amount')}</dt>
          <dd>
            <MoneyText value={money(credit.amount, credit.currency)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('credits.remaining')}</dt>
          <dd>
            <MoneyText value={money(detail.remaining, credit.currency)} />
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{tAp('credits.list.columns.creditDate')}</dt>
          <dd dir="ltr">
            {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(credit.creditDate))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { listVendorCredits, type ApCreditLifecycleDisplayStatus } from '@/modules/ap';
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

export default async function EmployeeApCreditsPage() {
  const t = await getTranslations('employeeApp.ap');
  const tAp = await getTranslations('ap');
  const locale = await getLocale();

  const credits = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.AP_READ)) return null;
    return listVendorCredits(context);
  });

  if (!credits) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/employee/ap"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('detail.back')}
      </Link>
      <div>
        <h1 className="text-lg font-semibold">{tAp('credits.listTitle')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{tAp('credits.listDescription')}</p>
      </div>
      {credits.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{tAp('credits.emptyList.title')}</p>
      ) : (
        <ul className="space-y-2">
          {credits.map((credit) => (
            <li key={credit.id}>
              <Link
                href={`/employee/ap/credits/${credit.id}`}
                className="flex min-h-11 flex-col gap-1 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {credit.reference?.trim() || tAp('credits.list.noReference')}
                  </span>
                  <StatusBadge
                    shape={creditStatusShape(credit.displayStatus)}
                    label={tAp(
                      `credits.statuses.${credit.displayStatus}` as 'credits.statuses.open',
                    )}
                  />
                </span>
                <span className="text-sm text-[var(--pf-text-secondary)]">
                  {credit.vendorName ?? '—'}
                </span>
                <MoneyText value={money(credit.amount, credit.currency)} />
                <span className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                  {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(credit.creditDate),
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

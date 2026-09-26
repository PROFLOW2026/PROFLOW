import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { employeePrimaryButtonClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeCreateApBillDraftAction } from '../actions';

export default async function EmployeeNewApBillPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations('employeeApp.ap');
  const query = await searchParams;

  const payload = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.AP_MANAGE)) return null;
    const canReadVendors = employeeHasPermission(context, PERMISSIONS.VENDORS_READ);
    const vendors = canReadVendors
      ? await listVendorsForOrg(context, { status: 'active' }).catch(() => [])
      : [];
    return {
      vendors: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
      currency: context.organization.baseCurrency ?? 'ILS',
      defaultDate: todayInTimeZone(context.organization.timezone),
      canReadVendors,
    };
  });

  if (!payload) notFound();

  const inputClass =
    'w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm';

  return (
    <div className="space-y-4">
      <Link
        href="/employee/ap"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('detail.back')}
      </Link>
      <div>
        <h1 className="text-lg font-semibold">{t('createForm.title')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('createForm.draftHint')}</p>
      </div>
      {query.error ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('createForm.error')}
        </p>
      ) : null}
      {!payload.canReadVendors || payload.vendors.length === 0 ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('createForm.noVendors')}
        </p>
      ) : (
        <form action={employeeCreateApBillDraftAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="vendorId" className="text-sm font-medium">
              {t('createForm.vendor')}
            </label>
            <select id="vendorId" name="vendorId" required className={inputClass}>
              <option value="">{t('createForm.selectVendor')}</option>
              {payload.vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="description" className="text-sm font-medium">
              {t('createForm.description')}
            </label>
            <input id="description" name="description" required className={inputClass} />
          </div>
          <div className="space-y-2">
            <label htmlFor="amount" className="text-sm font-medium">
              {t('createForm.amount', { currency: payload.currency })}
            </label>
            <input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="billDate" className="text-sm font-medium">
              {t('createForm.date')}
            </label>
            <input
              id="billDate"
              name="billDate"
              type="date"
              defaultValue={payload.defaultDate}
              className={inputClass}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="reference" className="text-sm font-medium">
              {t('createForm.reference')}
            </label>
            <input id="reference" name="reference" className={inputClass} />
          </div>
          <button type="submit" className={employeePrimaryButtonClass}>
            {t('createForm.submit')}
          </button>
        </form>
      )}
    </div>
  );
}

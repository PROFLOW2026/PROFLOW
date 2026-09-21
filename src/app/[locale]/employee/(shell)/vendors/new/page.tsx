import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeCreateVendorAction } from '../actions';

export default async function EmployeeCreateVendorPage() {
  const t = await getTranslations('employeeApp.vendors.createForm');

  const allowed = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    return employeeHasPermission(context, PERMISSIONS.VENDORS_MANAGE);
  });

  if (!allowed) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/employee/vendors"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>

      <form action={employeeCreateVendorAction} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            {t('name')}
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium">
            {t('phone')}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            {t('email')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="min-h-[48px] w-full rounded-xl bg-[var(--pf-primary)] px-4 py-3 text-sm font-medium text-white"
        >
          {t('submit')}
        </button>
      </form>
    </div>
  );
}

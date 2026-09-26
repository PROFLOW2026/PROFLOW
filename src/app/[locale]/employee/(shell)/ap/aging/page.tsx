import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Link } from '@/shared/i18n/navigation';
import {
  getOrganizationPayablesAging,
  type ApAgingBucketKey,
} from '@/modules/ap';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const BUCKET_ORDER: ApAgingBucketKey[] = [
  'current',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'days_90_plus',
];

export default async function EmployeeApAgingPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string; projectId?: string; asOf?: string }>;
}) {
  const t = await getTranslations('employeeApp.ap');
  const tAp = await getTranslations('ap');
  const locale = await getLocale();
  const filters = await searchParams;
  const asOfRaw = typeof filters.asOf === 'string' && filters.asOf ? filters.asOf : undefined;

  const data = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.AP_READ)) return null;
    const today = todayInTimeZone(context.organization.timezone);
    const asOf = asOfRaw ? businessDate(asOfRaw) : today;
    const [aging, vendors, projects] = await Promise.all([
      getOrganizationPayablesAging(context, {
        vendorId: filters.vendorId || undefined,
        projectId: filters.projectId || undefined,
        asOf,
      }),
      employeeHasPermission(context, PERMISSIONS.VENDORS_READ)
        ? listVendorsForOrg(context, { status: 'active' }).catch(() => [])
        : Promise.resolve([]),
      employeeHasPermission(context, PERMISSIONS.PROJECTS_READ)
        ? listProjectsForOrg(context, {}).catch(() => [])
        : Promise.resolve([]),
    ]);
    return { aging, vendors, projects, today };
  });

  if (!data) notFound();

  const inputClass =
    'h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link
        href="/employee/ap"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('detail.back')}
      </Link>
      <div>
        <h1 className="text-lg font-semibold">{tAp('aging.title')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{tAp('aging.description')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]" dir="ltr">
          {tAp('aging.asOf', {
            date: intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
              new Date(data.aging.asOf),
            ),
          })}
        </p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>{tAp('aging.asOfLabel')}</span>
          <input
            type="date"
            name="asOf"
            defaultValue={asOfRaw ?? data.today}
            className={inputClass}
            dir="ltr"
          />
        </label>
        {data.vendors.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>{tAp('aging.vendor')}</span>
            <select
              name="vendorId"
              defaultValue={filters.vendorId ?? ''}
              className={`${inputClass} min-w-[12rem]`}
            >
              <option value="">{tAp('aging.allVendors')}</option>
              {data.vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {data.projects.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>{tAp('aging.project')}</span>
            <select
              name="projectId"
              defaultValue={filters.projectId ?? ''}
              className={`${inputClass} min-w-[12rem]`}
            >
              <option value="">{tAp('aging.allProjects')}</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="submit"
          className="h-11 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
        >
          {tAp('aging.apply')}
        </button>
      </form>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-4">
          <p className="text-xs text-[var(--pf-text-secondary)]">{tAp('aging.total')}</p>
          <p className="mt-1 text-lg font-semibold">
            <MoneyText value={data.aging.totalOutstanding} />
          </p>
        </div>
        {BUCKET_ORDER.map((key) => {
          const bucket = data.aging.buckets.find((row) => row.key === key);
          if (!bucket) return null;
          return (
            <div
              key={key}
              className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-4"
            >
              <p className="text-xs text-[var(--pf-text-secondary)]">{tAp(`aging.buckets.${key}`)}</p>
              <p className="mt-1 font-semibold">
                <MoneyText value={bucket.total} />
              </p>
              <p className="text-xs text-[var(--pf-text-secondary)]">
                {tAp('aging.count', { count: bucket.count })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getOrganizationPayablesAging, type ApAgingBucketKey } from '@/modules/ap';
import { listVendorsForOrg } from '@/modules/vendors';
import { listProjectsForOrg } from '@/modules/projects';
import { ExportDownloadControl } from '@/modules/exports/ui/export-download-control';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('aging.title') };
}

const BUCKET_ORDER: ApAgingBucketKey[] = [
  'current',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'days_90_plus',
];

export default async function ApAgingPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string; projectId?: string; asOf?: string }>;
}) {
  const t = await getTranslations('ap');
  const tExports = await getTranslations('exports');
  const locale = await getLocale();
  const filters = await searchParams;
  const asOfRaw = typeof filters.asOf === 'string' && filters.asOf ? filters.asOf : undefined;

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.AP_READ)) {
      return { canRead: false as const, aging: null, vendors: [], projects: [], today: '' };
    }
    const today = todayInTimeZone(context.organization.timezone);
    const asOf = asOfRaw ? businessDate(asOfRaw) : today;
    const [aging, vendors, projects] = await Promise.all([
      getOrganizationPayablesAging(context, {
        vendorId: filters.vendorId || undefined,
        projectId: filters.projectId || undefined,
        asOf,
      }),
      hasPermission(context, PERMISSIONS.VENDORS_READ)
        ? listVendorsForOrg(context, { status: 'active' }).catch(() => [])
        : Promise.resolve([]),
      hasPermission(context, PERMISSIONS.PROJECTS_READ)
        ? listProjectsForOrg(context, {}).catch(() => [])
        : Promise.resolve([]),
    ]);
    return {
      canRead: true as const,
      aging,
      baseCurrency: context.organization.baseCurrency,
      vendors,
      projects,
      today,
    };
  });

  if (!data.canRead || !data.aging) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('aging.title')} description={t('aging.description')} />
        <EmptyState title={t('empty.noAccess.title')} description={t('empty.noAccess.body')} />
      </div>
    );
  }

  const { aging } = data;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('aging.title')}
        description={t('aging.description')}
        breadcrumb={
          <Link href="/procurement/ap" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        actions={
          <ExportDownloadControl href="/exports/ap-bills" size="sm" variant="secondary">
            {tExports('kinds.apBills')}
          </ExportDownloadControl>
        }
        meta={
          <span className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
            {t('aging.asOf', {
              date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                new Date(aging.asOf),
              ),
            })}
          </span>
        }
      />

      <p className="text-xs text-[var(--pf-text-muted)]">{t('aging.note')}</p>
      <p className="text-xs text-[var(--pf-text-secondary)]">{t('aging.filterNote')}</p>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('aging.asOfLabel')}</span>
          <input
            type="date"
            name="asOf"
            defaultValue={asOfRaw ?? data.today}
            className="h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
            dir="ltr"
          />
        </label>
        {data.vendors.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span>{t('aging.vendor')}</span>
            <select
              name="vendorId"
              defaultValue={filters.vendorId ?? ''}
              className="h-11 min-w-[12rem] rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
            >
              <option value="">{t('aging.allVendors')}</option>
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
            <span>{t('aging.project')}</span>
            <select
              name="projectId"
              defaultValue={filters.projectId ?? ''}
              className="h-11 min-w-[12rem] rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
            >
              <option value="">{t('aging.allProjects')}</option>
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
          {t('aging.apply')}
        </button>
        {(filters.vendorId || filters.projectId || asOfRaw) ? (
          <Link
            href="/procurement/ap/aging"
            className="inline-flex h-11 items-center px-3 text-sm text-[var(--pf-text-secondary)] hover:underline"
          >
            {t('aging.clear')}
          </Link>
        ) : null}
      </form>

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-4">
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('aging.total')}</p>
          <p className="mt-1 text-lg font-semibold">
            <MoneyText value={aging.totalOutstanding} />
          </p>
        </div>
        {BUCKET_ORDER.map((key) => {
          const bucket = aging.buckets.find((b) => b.key === key);
          if (!bucket) return null;
          return (
            <div
              key={key}
              className="min-w-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-4"
            >
              <p className="break-words text-xs text-[var(--pf-text-secondary)]">
                {t(`aging.buckets.${key}`)}
              </p>
              <p className="mt-1 text-base font-semibold">
                <MoneyText value={bucket.total} />
              </p>
              <p className="text-xs text-[var(--pf-text-secondary)]">
                {t('aging.count', { count: bucket.count })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getOrganizationPayablesAging, type ApAgingBucketKey } from '@/modules/ap';
import { withOrgContext } from '@/shared/auth/session';
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
  searchParams: Promise<{ vendorId?: string; projectId?: string }>;
}) {
  const t = await getTranslations('ap');
  const locale = await getLocale();
  const filters = await searchParams;

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.AP_READ)) {
      return { canRead: false as const, aging: null };
    }
    const aging = await getOrganizationPayablesAging(context);
    return { canRead: true as const, aging, baseCurrency: context.organization.baseCurrency };
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
  // Client-side-ish filter note: aging service is org-wide; filter labels are for UX disclosure.
  const filterNote =
    filters.vendorId || filters.projectId
      ? t('aging.filterNote')
      : null;

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
      {filterNote ? <p className="text-xs text-[var(--pf-text-secondary)]">{filterNote}</p> : null}

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

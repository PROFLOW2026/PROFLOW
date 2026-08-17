import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listOrgWarrantyCoverages } from '@/modules/warranty';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'warranty' });
  return { title: t('title') };
}

export default async function WarrantyPage() {
  const t = await getTranslations('warranty');
  const coverages = await withOrgContext((context) => listOrgWarrantyCoverages(context)).catch(
    () => [],
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('title')} />
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>

      {coverages.length === 0 ? (
        <EmptyState title={t('list.empty')} />
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {coverages.map((coverage) => (
            <li
              key={coverage.id}
              className="rounded-lg border border-[var(--pf-border-default)] p-4"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/projects/${coverage.projectId}?tab=warranty`}
                    prefetch={false}
                    className={cn(textNavLinkClassName, 'font-semibold')}
                  >
                    {coverage.title}
                  </Link>
                  <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                    {coverage.projectName}
                    {coverage.endDate ? ` · ${coverage.endDate}` : ''}
                  </p>
                </div>
                <StatusBadge
                  shape={
                    coverage.status === 'active'
                      ? 'active'
                      : coverage.status === 'expired'
                        ? 'overdue'
                        : coverage.status === 'void'
                          ? 'void'
                          : 'pending'
                  }
                  label={t(`coverage.status.${coverage.status}`)}
                />
              </div>
              {coverage.openIssueCount > 0 ? (
                <p className="mt-2 text-sm">{t('list.openIssues', { count: coverage.openIssueCount })}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

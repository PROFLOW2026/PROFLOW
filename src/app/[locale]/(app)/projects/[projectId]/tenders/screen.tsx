import { Gavel } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listProjectTenderPackages } from '@/modules/contractor-procurement';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectTendersScreen({ surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const t = await getTranslations('awards');
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/tenders`;
  const packages = await withOrgContext((context) => listProjectTenderPackages(context, projectId));

  return (
    <WithClientMessages extra={['awards']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        {packages.length === 0 ? (
          <EmptyState icon={Gavel} title={t('empty.title')} description={t('empty.description')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {packages.map((pkg) => (
              <li key={pkg.id}>
                <Link
                  href={`${base}/${pkg.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm hover:bg-[var(--pf-surface-hover)]"
                >
                  <div>
                    <p className="font-medium">{pkg.title}</p>
                    <p className="text-[var(--pf-text-muted)]">
                      {t('fields.trade')}: {pkg.tradeKey}
                    </p>
                  </div>
                  <StatusBadge label={t(`status.${pkg.status}`)} shape="pending" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WithClientMessages>
  );
}

export default function ProjectTendersPage(
  props: Omit<Parameters<typeof ProjectTendersScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectTendersScreen {...props} />;
}

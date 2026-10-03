import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { ActivityFeed } from '@/modules/collaboration/ui';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function ProjectActivityScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ domain?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const domain = query.domain === 'task' || query.domain === 'coordination' ? query.domain : null;

  const orgId = await withOrgContext(async (context) => context.organizationId).catch((error) => {
    if (error instanceof AuthorizationError) return null;
    throw error;
  });
  if (!orgId) notFound();

  const t = await getTranslations('collaboration');
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/activity`;
  const tab = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium',
      active
        ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]'
        : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-hover)]',
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('activity.pageTitle')} description={t('activity.pageDescription')} />

      <nav className="flex flex-wrap gap-1" aria-label={t('activity.filtersLabel')}>
        <Link href={base} className={tab(!domain)} aria-current={!domain ? 'page' : undefined}>
          {t('activity.filters.all')}
        </Link>
        <Link href={`${base}?domain=task`} className={tab(domain === 'task')} aria-current={domain === 'task' ? 'page' : undefined}>
          {t('activity.filters.tasks')}
        </Link>
        <Link
          href={`${base}?domain=coordination`}
          className={tab(domain === 'coordination')}
          aria-current={domain === 'coordination' ? 'page' : undefined}
        >
          {t('activity.filters.coordination')}
        </Link>
      </nav>

      <ActivityFeed organizationId={orgId} projectId={projectId} viewer="internal" domain={domain} limit={30} surfaceRoot={surfaceRoot} />
    </div>
  );
}

export default function ProjectActivityPage(
  props: Omit<Parameters<typeof ProjectActivityScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectActivityScreen {...props} />;
}

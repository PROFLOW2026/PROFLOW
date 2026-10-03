import { MessageCircleQuestion } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { loadRfiFormOptions, listProjectRfis } from '@/modules/rfi';
import { RfiCreateForm } from '@/modules/rfi/ui/rfi-create-form';
import { RfiList } from '@/modules/rfi/ui/rfi-list';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { cn } from '@/shared/ui/cn';
import type { RfiStatus } from '@/modules/rfi/domain/types';

const FILTERS = ['open', 'overdue', 'draft', 'submitted', 'under_review', 'answered', 'closed'] as const;

export async function ProjectRfisScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; new?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const statusParam = query.status;
  const status =
    statusParam && (FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as (typeof FILTERS)[number])
      : 'open';
  const wantsCreate = query.new === '1';
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/rfi`;

  const data = await withOrgContext(async (context) => {
    try {
      const list = await listProjectRfis(context, {
        projectId,
        status: status === 'open' || status === 'overdue' ? status : (status as RfiStatus),
      });
      const formOptions = wantsCreate && list.canManage ? await loadRfiFormOptions(context, projectId) : null;
      return { list, formOptions };
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  });
  if (!data) notFound();

  const [t, locale] = await Promise.all([getTranslations('rfi'), getLocale()]);
  const tabClass = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium',
      active
        ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]'
        : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-hover)]',
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {data.formOptions ? (
        <WithClientMessages extra={['rfi', 'common']}>
          <RfiCreateForm projectId={projectId} options={data.formOptions} cancelHref={base} />
        </WithClientMessages>
      ) : null}

      <nav className="flex flex-wrap gap-1" aria-label={t('filters.label')}>
        {FILTERS.map((filter) => (
          <Link
            key={filter}
            href={filter === 'open' ? base : `${base}?status=${filter}`}
            className={tabClass(status === filter)}
            aria-current={status === filter ? 'page' : undefined}
          >
            {t(`filters.${filter}`)}
          </Link>
        ))}
      </nav>

      {data.list.items.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title={t('list.emptyFiltered')}
          description={t('list.emptyDescription')}
          action={
            data.list.canManage && !data.formOptions ? (
              <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>
                {t('create.title')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <RfiList items={data.list.items} basePath={base} locale={locale} />
      )}
    </div>
  );
}

export default function ProjectRfisPage(
  props: Omit<Parameters<typeof ProjectRfisScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectRfisScreen {...props} />;
}

import { FileCheck2 } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { loadSubmittalFormOptions, listProjectSubmittals } from '@/modules/submittals';
import { SubmittalCreateForm } from '@/modules/submittals/ui/submittal-create-form';
import { SubmittalList } from '@/modules/submittals/ui/submittal-list';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { cn } from '@/shared/ui/cn';
import type { SubmittalStatus } from '@/modules/submittals/domain/types';

const FILTERS = ['pending', 'action_required', 'overdue', 'approved', 'draft'] as const;

export async function ProjectSubmittalsScreen({ surfaceRoot,
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
      : 'pending';
  const wantsCreate = query.new === '1';
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/submittals`;

  const data = await withOrgContext(async (context) => {
    try {
      const list = await listProjectSubmittals(context, {
        projectId,
        status: status as SubmittalStatus | 'pending' | 'action_required' | 'overdue',
      });
      const formOptions = wantsCreate && list.canManage ? await loadSubmittalFormOptions(context, projectId) : null;
      return { list, formOptions };
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  });
  if (!data) notFound();

  const [t, locale] = await Promise.all([getTranslations('submittals'), getLocale()]);
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
        <WithAppClientMessages extra={['submittals', 'common']}>
          <SubmittalCreateForm projectId={projectId} options={data.formOptions} cancelHref={base} />
        </WithAppClientMessages>
      ) : null}

      <nav className="flex flex-wrap gap-1" aria-label={t('filters.label')}>
        {FILTERS.map((filter) => (
          <Link
            key={filter}
            href={filter === 'pending' ? base : `${base}?status=${filter}`}
            className={tabClass(status === filter)}
            aria-current={status === filter ? 'page' : undefined}
          >
            {t(`filters.${filter}`)}
          </Link>
        ))}
      </nav>

      {data.list.items.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
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
        <SubmittalList items={data.list.items} basePath={base} locale={locale} />
      )}
    </div>
  );
}

export default function ProjectSubmittalsPage(
  props: Omit<Parameters<typeof ProjectSubmittalsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectSubmittalsScreen {...props} />;
}

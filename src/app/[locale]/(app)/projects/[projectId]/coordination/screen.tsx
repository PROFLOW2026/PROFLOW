import { CalendarClock } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  listProjectCoordinationEvents,
  loadCoordinationFormOptions,
  type CoordinationFormOptions,
} from '@/modules/coordination';
import { CoordinationCreateForm } from '@/modules/coordination/ui/coordination-create-form';
import { CoordinationEventList } from '@/modules/coordination/ui/coordination-event-list';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { cn } from '@/shared/ui/cn';

const PAGE_SIZE = 30;

export async function ProjectCoordinationScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ scope?: string; new?: string; page?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const scope = query.scope === 'closed' ? 'closed' : 'open';
  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);
  const wantsCreate = query.new === '1';

  const data = await withOrgContext(async (context) => {
    try {
      const list = await listProjectCoordinationEvents(context, projectId, {
        scope,
        limit: PAGE_SIZE * page,
      });
      const formOptions: CoordinationFormOptions | null =
        wantsCreate && list.canManage ? await loadCoordinationFormOptions(context, projectId) : null;
      return { list, formOptions, timeZone: context.organization.timezone };
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  });
  if (!data) notFound();

  const [t, locale] = await Promise.all([getTranslations('coordination'), getLocale()]);
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/coordination`;
  const tabClass = (active: boolean) =>
    cn(
      'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium',
      active
        ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]'
        : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-hover)]',
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('list.pageTitle')} description={t('list.pageDescription')} />

      {data.formOptions ? (
        <WithAppClientMessages extra={['coordination']}>
          <CoordinationCreateForm projectId={projectId} options={data.formOptions} cancelHref={base} />
        </WithAppClientMessages>
      ) : null}

      <nav className="flex gap-1" aria-label={t('list.pageTitle')}>
        <Link href={base} className={tabClass(scope === 'open')} aria-current={scope === 'open' ? 'page' : undefined}>
          {t('list.open')}
        </Link>
        <Link
          href={`${base}?scope=closed`}
          className={tabClass(scope === 'closed')}
          aria-current={scope === 'closed' ? 'page' : undefined}
        >
          {t('list.closed')}
        </Link>
      </nav>

      {data.list.items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={scope === 'open' ? t('list.emptyOpenTitle') : t('list.emptyClosedTitle')}
          description={scope === 'open' ? t('list.emptyOpenDescription') : t('list.emptyClosedDescription')}
          action={
            scope === 'open' && data.list.canManage && !data.formOptions ? (
              <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>
                {t('list.scheduleEvent')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <CoordinationEventList
            items={data.list.items}
            projectId={projectId}
            locale={locale}
            timeZone={data.timeZone}
            basePath={base}
          />
          {data.list.hasMore ? (
            <div className="flex justify-center">
              <Link
                href={`${base}?${new URLSearchParams({ ...(scope === 'closed' ? { scope } : {}), page: String(page + 1) })}`}
                className={buttonVariants({ variant: 'secondary' })}
                scroll={false}
              >
                {t('list.loadMore')}
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function ProjectCoordinationPage(
  props: Omit<Parameters<typeof ProjectCoordinationScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectCoordinationScreen {...props} />;
}

import { Wrench } from 'lucide-react';

import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';

import { EmptyState } from '@/components/ui/empty-state';

import { PageHeader } from '@/components/ui/page-header';

import {

  countProjectDefects,

  getDefectPermissions,

  listProjectDefects,

  loadQualityFormData,

} from '@/modules/defects';

import { DefectCreateForm } from '@/modules/defects/ui/defect-create-form';

import { DefectList } from '@/modules/defects/ui/defect-list';

import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';

import { requireProjectCapabilityPage } from '@/modules/project-team/server';

import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';

import { withOrgContext } from '@/shared/auth/session';

import { Link } from '@/shared/i18n/navigation';

import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

import { cn } from '@/shared/ui/cn';

import type { DefectStatusFilter } from '@/modules/defects/domain/lifecycle';



const PAGE_SIZE = 30;



export async function ProjectDefectsScreen({ surfaceRoot,

  params,

  searchParams,

}: {
    surfaceRoot?: string;


  params: Promise<{ projectId: string }>;

  searchParams: Promise<{ status?: string; new?: string; page?: string }>;

}) {

  const { projectId } = await params;

  const query = await searchParams;

  const status = parseStatus(query.status);

  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);

  const wantsCreate = query.new === '1';



  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);

  const t = await getTranslations('defects');

  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/defects`;



  const data = await loadOrNotFound(() =>

    withOrgContext(async (context) => {

      const [list, counts, permissions] = await Promise.all([

        listProjectDefects(context, projectId, { status, limit: PAGE_SIZE * page }),

        countProjectDefects(context, projectId),

        getDefectPermissions(context, projectId),

      ]);

      const formData = wantsCreate && permissions.create ? await loadQualityFormData(context, projectId) : null;

      return { list, counts, permissions, formData };

    }),

  );



  const tabClass = (active: boolean) =>

    cn(

      'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium',

      active

        ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]'

        : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-surface-hover)]',

    );



  return (

    <WithAppClientMessages extra={['defects', 'inspections']}>

      <div className="flex flex-col gap-6">

        <PageHeader

          title={t('title')}

          description={t('description')}

          actions={

            data.permissions.create ? (

              <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>

                {t('create.title')}

              </Link>

            ) : undefined

          }

        />



        {data.formData ? (
          <DefectCreateForm projectId={projectId} formData={data.formData} cancelHref={base} returnBase={base} />
        ) : null}



        <div className="flex flex-wrap gap-2 text-sm text-[var(--pf-text-secondary)]">

          <span>

            {t('counts.toFix')}: {data.counts.open + data.counts.assigned + data.counts.reopened}

          </span>

          <span>

            {t('counts.awaitingVerification')}: {data.counts.awaitingVerification}

          </span>

          <span>

            {t('counts.overdue')}: {data.counts.overdue}

          </span>

        </div>



        <nav className="flex flex-wrap gap-1" aria-label={t('title')}>

          <Link href={base} className={tabClass(status === 'all')} aria-current={status === 'all' ? 'page' : undefined}>

            {t('filters.all')}

          </Link>

          <Link

            href={`${base}?status=active`}

            className={tabClass(status === 'active')}

            aria-current={status === 'active' ? 'page' : undefined}

          >

            {t('filters.active')}

          </Link>

          <Link

            href={`${base}?status=awaiting_verification`}

            className={tabClass(status === 'awaiting_verification')}

            aria-current={status === 'awaiting_verification' ? 'page' : undefined}

          >

            {t('filters.awaiting_verification')}

          </Link>

          <Link

            href={`${base}?status=closed`}

            className={tabClass(status === 'closed')}

            aria-current={status === 'closed' ? 'page' : undefined}

          >

            {t('filters.closed')}

          </Link>

        </nav>



        {data.list.items.length === 0 ? (

          <EmptyState

            icon={Wrench}

            title={t('list.empty')}

            description={t('list.emptyDescription')}

            action={

              data.permissions.create && !data.formData ? (

                <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>

                  {t('create.title')}

                </Link>

              ) : undefined

            }

          />

        ) : (

          <>

            <DefectList items={data.list.items} basePath={base} />

            {data.list.hasMore ? (

              <div className="flex justify-center">

                <Link

                  href={`${base}?${new URLSearchParams({ ...(status !== 'all' ? { status } : {}), page: String(page + 1) })}`}

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

    </WithAppClientMessages>

  );

}



function parseStatus(value?: string): DefectStatusFilter {

  if (value === 'active' || value === 'awaiting_verification' || value === 'closed') return value;

  return 'all';

}



export default function ProjectDefectsPage(
  props: Omit<Parameters<typeof ProjectDefectsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectDefectsScreen {...props} />;
}

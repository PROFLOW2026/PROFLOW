import { ClipboardCheck } from 'lucide-react';

import { getTranslations } from 'next-intl/server';

import { buttonVariants } from '@/components/ui/button';

import { EmptyState } from '@/components/ui/empty-state';

import { PageHeader } from '@/components/ui/page-header';

import {

  countProjectInspections,

  getInspectionPermissions,

  listInspectionTemplateOptions,

  listProjectInspections,

  loadInspectionFormData,

} from '@/modules/inspections';

import { InspectionCreateForm } from '@/modules/inspections/ui/inspection-create-form';

import { InspectionList } from '@/modules/inspections/ui/inspection-list';

import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';

import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';

import { withOrgContext } from '@/shared/auth/session';

import { Link } from '@/shared/i18n/navigation';

import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

import { cn } from '@/shared/ui/cn';



const PAGE_SIZE = 30;



export async function ProjectInspectionsScreen({ surfaceRoot,

  params,

  searchParams,

}: {
    surfaceRoot?: string;


  params: Promise<{ projectId: string }>;

  searchParams: Promise<{ status?: string; new?: string; page?: string }>;

}) {

  const { projectId } = await params;

  const query = await searchParams;

  const status = query.status === 'completed' ? 'completed' : query.status === 'open' ? 'open' : null;

  const page = Math.max(Number.parseInt(query.page ?? '1', 10) || 1, 1);

  const wantsCreate = query.new === '1';



  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);

  const t = await getTranslations('inspections');

  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/inspections`;



  const data = await loadOrNotFound(() =>

    withOrgContext(async (context) => {

      const [list, counts, permissions] = await Promise.all([

        listProjectInspections(context, projectId, { status, limit: PAGE_SIZE * page }),

        countProjectInspections(context, projectId),

        getInspectionPermissions(context, projectId),

      ]);

      const formBundle =

        wantsCreate && permissions.manage

          ? await Promise.all([

              loadInspectionFormData(context, projectId),

              listInspectionTemplateOptions(context, projectId),

            ])

          : null;

      return { list, counts, permissions, formBundle };

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

    <WithAppClientMessages extra={['inspections', 'defects']}>

      <div className="flex flex-col gap-6">

        <PageHeader

          title={t('title')}

          description={t('description')}

          actions={

            data.permissions.manage ? (

              <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>

                {t('create.title')}

              </Link>

            ) : undefined

          }

        />



        {data.formBundle ? (

          <InspectionCreateForm

            projectId={projectId}

            formData={data.formBundle[0]}

            templates={data.formBundle[1].options}

            cancelHref={base}
            returnBase={base}

          />

        ) : null}



        <div className="flex flex-wrap gap-2 text-sm text-[var(--pf-text-secondary)]">

          <span>{t('counts.open')}: {data.counts.open}</span>

          <span>{t('counts.failed')}: {data.counts.failed}</span>

        </div>



        <nav className="flex gap-1" aria-label={t('title')}>

          <Link href={base} className={tabClass(!status)} aria-current={!status ? 'page' : undefined}>

            {t('filters.all')}

          </Link>

          <Link href={`${base}?status=open`} className={tabClass(status === 'open')} aria-current={status === 'open' ? 'page' : undefined}>

            {t('status.open')}

          </Link>

          <Link

            href={`${base}?status=completed`}

            className={tabClass(status === 'completed')}

            aria-current={status === 'completed' ? 'page' : undefined}

          >

            {t('status.completed')}

          </Link>

        </nav>



        {data.list.items.length === 0 ? (

          <EmptyState

            icon={ClipboardCheck}

            title={t('list.empty')}

            description={t('list.emptyDescription')}

            action={

              data.permissions.manage && !data.formBundle ? (

                <Link href={`${base}?new=1`} className={buttonVariants({ variant: 'primary' })}>

                  {t('create.title')}

                </Link>

              ) : undefined

            }

          />

        ) : (

          <>

            <InspectionList items={data.list.items} basePath={base} />

            {data.list.hasMore ? (

              <div className="flex justify-center">

                <Link

                  href={`${base}?${new URLSearchParams({ ...(status ? { status } : {}), page: String(page + 1) })}`}

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




export default function ProjectInspectionsPage(
  props: Omit<Parameters<typeof ProjectInspectionsScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectInspectionsScreen {...props} />;
}

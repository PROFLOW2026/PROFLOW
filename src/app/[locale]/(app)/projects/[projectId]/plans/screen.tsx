import { Map } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectDrawings } from '@/modules/project-plans';
import { DrawingCreateForm } from '@/modules/project-plans/ui/drawing-create-form';
import { DrawingsRegister } from '@/modules/project-plans/ui/drawings-register';
import { PROJECT_CAPABILITIES } from '@/modules/project-team';
import { requireProjectCapabilityPage } from '@/modules/project-team/server';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export async function ProjectPlansScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  await requireProjectCapabilityPage(projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/plans`;
  const register = await withOrgContext((context) => listProjectDrawings(context, { projectId }));
  const t = await getTranslations('projectPlans.register');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />
      {query.new === '1' && register.canManage ? (
        <WithClientMessages extra={['projectPlans']}>
          <DrawingCreateForm projectId={projectId} basePath={base} />
        </WithClientMessages>
      ) : null}
      {register.drawings.length === 0 ? (
        <EmptyState icon={Map} title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <DrawingsRegister projectId={projectId} drawings={register.drawings} basePath={base} />
      )}
    </div>
  );
}

export default function ProjectPlansPage(
  props: Omit<Parameters<typeof ProjectPlansScreen>[0], 'surfaceRoot'>,
) {
  return <ProjectPlansScreen {...props} />;
}

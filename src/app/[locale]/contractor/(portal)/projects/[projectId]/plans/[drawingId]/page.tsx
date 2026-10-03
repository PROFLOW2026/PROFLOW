import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { getContractorDrawing } from '@/modules/project-plans';
import { ContractorDrawingDetailPanel } from '@/modules/project-plans/ui/contractor-drawing-detail';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorDrawingPage({
  params,
}: {
  params: Promise<{ projectId: string; drawingId: string }>;
}) {
  const { projectId, drawingId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) => g.capabilities.has(EXTERNAL_CAPABILITIES.PLAN_VIEW) && (g.projectId === projectId || g.projectId === null),
  );
  if (!grant) notFound();

  let detail;
  try {
    detail = await getContractorDrawing(context, { organizationId: grant.organizationId, drawingId });
  } catch {
    notFound();
  }
  if (detail.drawing.projectId !== projectId) notFound();

  const t = await getTranslations('projectPlans.portal.drawing');

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <PageHeader
        breadcrumb={
          <Link href={`/contractor/projects/${projectId}/plans`} className="text-sm text-[var(--pf-text-brand)] hover:underline">
            {t('back')}
          </Link>
        }
        title={t('pageTitle')}
      />
      <WithClientMessages extra={['projectPlans']}>
        <ContractorDrawingDetailPanel organizationId={grant.organizationId} projectId={projectId} detail={detail} />
      </WithClientMessages>
    </div>
  );
}

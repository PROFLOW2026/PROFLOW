import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import { getContractorDrawing } from '@/modules/project-plans';
import { PortalDrawingDetail } from '@/modules/contractor-portal/ui/portal-drawing-detail';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

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
    <div className={employeePageStackClass}>
      <Link href={`/contractor/projects/${projectId}/plans`} className="text-sm text-[var(--pf-text-brand)] hover:underline">
        {t('back')}
      </Link>
      <WithPortalClientMessages extra={['projectPlans']}>
        <PortalDrawingDetail organizationId={grant.organizationId} projectId={projectId} detail={detail} />
      </WithPortalClientMessages>
    </div>
  );
}

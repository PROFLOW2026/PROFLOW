import { notFound } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import { portalPageStackClass } from '@/modules/contractor-portal/ui/portal-surface';
import { TakeoffShell } from '@/modules/electrical-takeoff/ui/takeoff-shell';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ContractorProjectTakeoffPage({ params }: PageProps) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const grant = context.grants.find(
    (g) =>
      (g.projectId === projectId || g.projectId === null) &&
      (g.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_VIEW) ||
        g.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_UPLOAD)),
  );
  if (!grant) notFound();

  return (
    <div className={portalPageStackClass}>
      <TakeoffShell projectId={projectId} surface="contractor" />
    </div>
  );
}
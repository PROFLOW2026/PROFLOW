import { notFound } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalPageStackClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { InfraWorkspaceContractor } from '@/modules/infra-mapping/ui/infra-workspace-main';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';

interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ taskId?: string | string[] }>;
}

/**
 * Contractor portal: document / locate infrastructure on a project the contractor was granted
 * (`ext.document.upload` / `ext.document.view`). Photos go to the owning organization's cloud.
 */
export default async function ContractorInfrastructurePage({ params, searchParams }: PageProps) {
  const [{ projectId }, search] = await Promise.all([params, searchParams]);
  const taskId = Array.isArray(search.taskId) ? search.taskId[0] : search.taskId;
  const context = await requireExternalContext();

  const grant =
    context.grants.find(
      (g) =>
        (g.projectId === projectId || g.projectId === null) &&
        g.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_UPLOAD),
    ) ??
    context.grants.find(
      (g) =>
        (g.projectId === projectId || g.projectId === null) &&
        g.capabilities.has(EXTERNAL_CAPABILITIES.DOCUMENT_VIEW),
    );
  if (!grant) notFound();

  return (
    <div className={portalPageStackClass}>
      <InfraWorkspaceContractor projectId={projectId} organizationId={grant.organizationId} taskId={taskId ?? null} />
    </div>
  );
}

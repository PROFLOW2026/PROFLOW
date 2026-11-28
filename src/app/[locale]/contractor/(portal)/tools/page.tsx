import { notFound } from 'next/navigation';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { sweepOrgExternalTools } from '@/modules/external-tools/application/sweep-org';
import { externalToolsEnabled, externalWasmEnabled } from '@/modules/external-tools/domain/flags';
import { holdsOrgTool, ORG_TOOL_TAKEOFF, ORG_TOOL_VIEWER } from '@/modules/external-tools/domain/permissions';
import { ExternalToolsHome } from '@/modules/external-tools/ui/external-tools-home';

export default async function ContractorProfessionalToolsPage() {
  const session = await loadPortalSession();
  const view = holdsOrgTool(session.context.grants, ORG_TOOL_VIEWER);
  const takeoff = holdsOrgTool(session.context.grants, ORG_TOOL_TAKEOFF);
  if (!externalToolsEnabled() || (!view && !takeoff)) notFound();
  const grant = session.context.grants.find(
    (item) =>
      item.projectId === null &&
      (item.capabilities.has(ORG_TOOL_VIEWER) || item.capabilities.has(ORG_TOOL_TAKEOFF)),
  );
  if (grant) await sweepOrgExternalTools(grant.organizationId);
  return <ExternalToolsHome canView={view} canTakeoff={takeoff} wasmReady={externalWasmEnabled()} />;
}

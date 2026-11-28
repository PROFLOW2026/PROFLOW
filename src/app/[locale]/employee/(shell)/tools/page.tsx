import { withOrgContext } from '@/shared/auth/session';
import { sweepOrgExternalTools } from '@/modules/external-tools/application/sweep-org';
import { ExternalToolsScreen, externalToolAccess } from '@/modules/external-tools/ui/external-tools-page';

export default async function EmployeeProfessionalToolsPage() {
  const access = await withOrgContext(async (context) => {
    await sweepOrgExternalTools(context.organizationId);
    return externalToolAccess(context);
  });
  return <ExternalToolsScreen view={access.view} takeoff={access.takeoff} />;
}

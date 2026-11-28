import { withOrgContext } from '@/shared/auth/session';
import { ExternalToolsScreen, externalToolAccess } from '@/modules/external-tools/ui/external-tools-page';

export default async function EmployeeProfessionalToolsViewPage() {
  const access = await withOrgContext(async (context) => externalToolAccess(context));
  return <ExternalToolsScreen view={access.view} takeoff={access.takeoff} />;
}

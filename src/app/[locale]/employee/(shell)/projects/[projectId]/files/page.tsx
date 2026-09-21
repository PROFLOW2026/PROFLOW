import { notFound } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  employeeHasPermission,
} from '@/modules/employee-app/application/load-employee-app-context';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { employeeHasAnyAllowedSemanticFolder } from '@/modules/external-storage/domain/semantic-folder-access';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/server';
import { EmployeeProjectFilesBrowser } from '@/modules/employee-app/ui/employee-project-files-browser';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectFilesPage({ params }: PageProps) {
  const { projectId } = await params;

  const data = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return null;
    const overview = await getEmployeeProjectTaskOverview(context, projectId);
    if (!overview) return null;
    const storageConfigured = await isOrganizationStorageConfigured(context);
    const hasFolderAccess = employeeHasAnyAllowedSemanticFolder(context);
    return { overview, storageConfigured, hasFolderAccess };
  });

  if (!data) notFound();

  return (
    <div className={employeePageStackClass}>
      <p className="text-sm font-medium text-[var(--pf-text-secondary)]">{data.overview.displayName}</p>
      <EmployeeProjectFilesBrowser
        projectId={projectId}
        storageConfigured={data.storageConfigured}
        hasFolderAccess={data.hasFolderAccess}
      />
    </div>
  );
}

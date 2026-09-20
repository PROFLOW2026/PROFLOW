import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { listEmployeeProjectDocuments } from '@/modules/employee-app/application/employee-project-documents';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectFilesPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('employeeApp.projects');

  const data = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) return null;
    const overview = await getEmployeeProjectTaskOverview(context, projectId);
    if (!overview) return null;
    const files = await listEmployeeProjectDocuments(context, projectId);
    return { overview, files };
  });

  if (!data) notFound();

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{data.overview.displayName}</p>
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {data.files.map((doc) => (
          <li key={doc.id} className="px-4 py-3 text-sm">
            <div className="font-medium">{doc.originalFilename}</div>
            <div className="text-[var(--pf-text-secondary)]">{doc.category ?? t('files.noCategory')}</div>
          </li>
        ))}
        {data.files.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('files.empty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProjectFinancialsPanel } from '@/modules/financials/ui/project-financials-panel';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectFinancialsPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('employeeApp.financials');

  const allowed = await withOrgContext(async (context) =>
    employeeHasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
  );

  if (!allowed) notFound();

  return (
    <div className={employeePageStackClass}>
      <Link
        href={`/employee/projects/${projectId}`}
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>

      <ProjectFinancialsPanel projectId={projectId} />
    </div>
  );
}

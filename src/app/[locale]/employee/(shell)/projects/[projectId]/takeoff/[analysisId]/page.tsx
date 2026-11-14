import { notFound } from 'next/navigation';
import { getEmployeeProjectTaskOverview } from '@/modules/employee-app/application/employee-pm-tasks';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
import { TakeoffEmployeeClient } from '../takeoff-employee-client';
import { withOrgContext } from '@/shared/auth/session';

interface PageProps {
  params: Promise<{ projectId: string; analysisId: string }>;
}

export default async function EmployeeProjectTakeoffWorkspacePage({ params }: PageProps) {
  const { projectId, analysisId } = await params;
  const overview = await withOrgContext((context) => getEmployeeProjectTaskOverview(context, projectId));
  if (!overview) notFound();

  return (
    <div className={employeePageStackClass}>
      <p className="text-sm font-medium text-[var(--pf-text-secondary)]">{overview.displayName}</p>
      <TakeoffEmployeeClient projectId={projectId} analysisId={analysisId} />
    </div>
  );
}
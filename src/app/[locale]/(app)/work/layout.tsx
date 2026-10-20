import { MainAppPage } from '@/components/patterns/main-app';
import { notFound } from 'next/navigation';
import { getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { WorkHubNav } from '@/modules/tasks/ui/work-hub-nav';

export default async function WorkLayout({ children }: { children: React.ReactNode }) {
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.TASKS_READ) || !shell.modules.work_management) {
    notFound();
  }

  return (
    <MainAppPage>
      <WorkHubNav />
      {children}
    </MainAppPage>
  );
}

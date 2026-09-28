import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { listEmployeesForOrg } from '@/modules/workforce';
import { listOrgProjectTaskTemplatesForSettings } from '@/modules/tasks/application/manage-org-project-task-templates';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { ProjectTaskTemplatesPanel } from './project-task-templates-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('projectTaskTemplates');
}

export default async function ProjectTaskTemplatesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const tSection = await getTranslations('settings.projectTaskTemplatesSection');
  const tPanel = await getTranslations('settings.projectTaskTemplatesPanel');
  const params = await searchParams;
  const showArchived = params.archived === '1';

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE)) {
      return { allowed: false as const };
    }

    const [templates, employees] = await Promise.all([
      listOrgProjectTaskTemplatesForSettings(context, { includeArchived: showArchived }),
      listEmployeesForOrg(context, { status: 'active' }),
    ]);

    return {
      allowed: true as const,
      templates,
      employees: employees.map((employee) => ({ id: employee.id, name: employee.name })),
      canEdit: true,
      showArchived,
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={tSection('nav')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={tSection('nav')} description={tPanel('intro')}>
      <Card className="p-5">
        <ProjectTaskTemplatesPanel
          templates={data.templates}
          employees={data.employees}
          canEdit={data.canEdit}
          showArchived={data.showArchived}
        />
      </Card>
    </SettingsPageShell>
  );
}

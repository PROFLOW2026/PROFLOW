import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
// eslint-disable-next-line no-restricted-imports
import { projectTemplates, projectTemplateStages } from '@drizzle/schema';
// eslint-disable-next-line no-restricted-imports
import { eq, asc } from 'drizzle-orm';
import { SettingsPageShell } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { ProjectTemplatesPanel } from './project-templates-panel';

export const metadata: Metadata = { title: 'Project Templates' };

export default async function ProjectTemplatesSettingsPage() {
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PROJECT_TEMPLATES_MANAGE)) {
      return { allowed: false as const };
    }

    const rawTemplates = await context.db
      .select()
      .from(projectTemplates)
      .where(eq(projectTemplates.organizationId, context.organizationId))
      .orderBy(asc(projectTemplates.createdAt));

    const stages = await context.db
      .select()
      .from(projectTemplateStages)
      .where(eq(projectTemplateStages.organizationId, context.organizationId))
      .orderBy(asc(projectTemplateStages.position));

    const templates = rawTemplates.map((tpl) => ({
      ...tpl,
      stages: stages.filter((s) => s.templateId === tpl.id),
    }));

    return { allowed: true as const, templates, canEdit: true };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title="Project Templates">
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title="Project Templates"
      description="Reusable project blueprints with predefined stages."
    >
      <Card className="p-5">
        <ProjectTemplatesPanel templates={data.templates} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}

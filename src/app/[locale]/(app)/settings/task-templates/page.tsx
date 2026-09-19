import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
// eslint-disable-next-line no-restricted-imports
import { taskTemplates, taskTemplateItems } from '@drizzle/schema';
// eslint-disable-next-line no-restricted-imports
import { eq, asc } from 'drizzle-orm';
import { SettingsPageShell } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { TaskTemplatesPanel } from './task-templates-panel';

export const metadata: Metadata = { title: 'Task Templates' };

export default async function TaskTemplatesSettingsPage() {
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE)) {
      return { allowed: false as const };
    }

    const rawTemplates = await context.db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.organizationId, context.organizationId))
      .orderBy(asc(taskTemplates.createdAt));

    const items = await context.db
      .select()
      .from(taskTemplateItems)
      .where(eq(taskTemplateItems.organizationId, context.organizationId))
      .orderBy(asc(taskTemplateItems.sortKey));

    const templates = rawTemplates.map((tpl) => ({
      ...tpl,
      items: items.filter((item) => item.templateId === tpl.id),
    }));

    return { allowed: true as const, templates, canEdit: true };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title="Task Templates">
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title="Task Templates"
      description="Reusable task presets with title, description, priority, and checklist."
    >
      <Card className="p-5">
        <TaskTemplatesPanel templates={data.templates} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}

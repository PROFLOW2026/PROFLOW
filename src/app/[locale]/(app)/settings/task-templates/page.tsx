import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
// eslint-disable-next-line no-restricted-imports
import { taskTemplates, taskTemplateItems } from '@drizzle/schema';
// eslint-disable-next-line no-restricted-imports
import { eq, asc } from 'drizzle-orm';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { TaskTemplatesPanel } from './task-templates-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('taskTemplates');
}

export default async function TaskTemplatesSettingsPage() {
  const tSection = await getTranslations('settings.taskTemplatesSection');
  const tPanel = await getTranslations('settings.taskTemplatesPanel');
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
      <SettingsPageShell title={tSection('nav')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={tSection('nav')} description={tPanel('intro')}>
      <Card className="p-5">
        <TaskTemplatesPanel templates={data.templates} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}

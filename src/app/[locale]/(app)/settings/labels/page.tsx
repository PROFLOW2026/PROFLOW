import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
// eslint-disable-next-line no-restricted-imports
import { taskLabels } from '@drizzle/schema';
// eslint-disable-next-line no-restricted-imports
import { eq, asc } from 'drizzle-orm';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { LabelsPanel } from './labels-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('labels');
}

export default async function LabelsSettingsPage() {
  const t = await getTranslations('settings.labelsSection');
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE)) {
      return { allowed: false as const };
    }

    const labels = await context.db
      .select()
      .from(taskLabels)
      .where(eq(taskLabels.organizationId, context.organizationId))
      .orderBy(asc(taskLabels.name));

    return { allowed: true as const, labels, canEdit: true };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('nav')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('nav')} description={t('description')}>
      <Card className="p-5">
        <LabelsPanel labels={data.labels} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}

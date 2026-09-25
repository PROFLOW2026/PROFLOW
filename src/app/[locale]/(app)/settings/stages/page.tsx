import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
// eslint-disable-next-line no-restricted-imports
import { projectStageDefinitions } from '@drizzle/schema';
// eslint-disable-next-line no-restricted-imports
import { eq, asc } from 'drizzle-orm';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { StagesPanel } from './stages-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('stages');
}

export default async function StagesSettingsPage() {
  const t = await getTranslations('settings.stagesSection');
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.STAGES_MANAGE)) {
      return { allowed: false as const };
    }

    const stages = await context.db
      .select()
      .from(projectStageDefinitions)
      .where(eq(projectStageDefinitions.organizationId, context.organizationId))
      .orderBy(asc(projectStageDefinitions.position));

    return { allowed: true as const, stages, canEdit: true };
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
        <StagesPanel stages={data.stages} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}

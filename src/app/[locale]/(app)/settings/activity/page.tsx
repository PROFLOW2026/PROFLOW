import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, SETTINGS_SECTIONS } from '../_lib/access';
import { listAuditEvents } from '../_lib/audit';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { ActivityLogPanel } from './activity-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('activity');
}

export default async function ActivitySettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('settings.activity');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'activity')!;
  const params = await searchParams;
  const cursor = typeof params.cursor === 'string' ? params.cursor : null;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const result = await listAuditEvents(context, { cursor });
    return {
      allowed: true as const,
      timezone: context.organization.timezone,
      ...result,
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('title')}>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/exports/audit?format=csv"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          {t('exportCsv')}
        </Link>
      </div>
      <Card className="p-5">
        <ActivityLogPanel
          items={data.items}
          nextCursor={data.nextCursor}
          timezone={data.timezone}
        />
      </Card>
    </SettingsPageShell>
  );
}

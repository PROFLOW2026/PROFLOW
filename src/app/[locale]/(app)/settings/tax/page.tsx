import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listTaxRules, resolveTaxForDate } from '@/modules/tax';
import { todayInTimeZone } from '@/shared/dates';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { TaxSettingsPanel } from './tax-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('tax');
}

export default async function TaxSettingsPage() {
  const t = await getTranslations('tax');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'tax')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const [rules, resolution] = await Promise.all([
      listTaxRules(context),
      resolveTaxForDate(context, todayInTimeZone(context.organization.timezone)),
    ]);

    const currentRateLabel = resolution.resolved?.ratePercent
      ? `${resolution.resolved.ratePercent}%`
      : null;

    return {
      allowed: true as const,
      rules,
      countryCode: context.organization.countryCode,
      timezone: context.organization.timezone,
      currentRateLabel,
      canEdit: canManageSection(context, 'tax'),
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
      <Card className="p-5">
        <TaxSettingsPanel
          rules={data.rules}
          countryCode={data.countryCode}
          timezone={data.timezone}
          currentRateLabel={data.currentRateLabel}
          canEdit={data.canEdit}
        />
      </Card>
    </SettingsPageShell>
  );
}

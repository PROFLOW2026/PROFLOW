import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listApprovalRulesWithSteps } from '@/modules/approvals';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { ApprovalRulesPanel } from './rules-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('approvals');
}

export default async function ApprovalsSettingsPage() {
  const t = await getTranslations('approvals');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'approvals')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const rules = await listApprovalRulesWithSteps(context);
    return {
      allowed: true as const,
      rules,
      canEdit: canManageSection(context, 'approvals'),
      defaultCurrency: context.organization.baseCurrency,
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('rulesTitle')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('rulesTitle')} description={t('rulesDescription')}>
      <Card className="p-5">
        <ApprovalRulesPanel
          rules={data.rules}
          canEdit={data.canEdit}
          defaultCurrency={data.defaultCurrency}
        />
      </Card>
    </SettingsPageShell>
  );
}

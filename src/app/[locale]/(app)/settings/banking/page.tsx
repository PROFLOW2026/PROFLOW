import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import {
  areBankingPersistenceAvailable,
  listBankAccounts,
  listBankTransactions,
} from '@/modules/banking';
import { BankingReconciliationPanelLazy } from '@/modules/banking/ui';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { SettingsPageShell } from '../settings-shell';

/**
 * Banking settings surface (Agent 3).
 * Requires banking.read; manage actions require banking.manage.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('banking');
  return { title: t('title') };
}

export default async function BankingSettingsPage() {
  const t = await getTranslations('banking');
  const title = t('title');
  const description = t('description');

  const data = await withOrgContext(async (context) => {
    const canRead = hasPermission(context, PERMISSIONS.BANKING_READ);
    if (!canRead) {
      return { allowed: false as const };
    }
    const [accounts, transactions] = await Promise.all([
      listBankAccounts(context),
      listBankTransactions(context, {}),
    ]);
    return {
      allowed: true as const,
      accounts,
      transactions,
      defaultCurrency: context.organization.baseCurrency,
      canManage: hasPermission(context, PERMISSIONS.BANKING_MANAGE),
      persistenceReady: areBankingPersistenceAvailable(),
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={title} description={description}>
        <Card className="p-5 text-sm text-[var(--pf-text-secondary)]">
          Not allowed
        </Card>
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={title} description={description}>
      <Card className="p-5">
        {!data.persistenceReady ? (
          <p className="mb-4 text-sm text-[var(--pf-text-secondary)]">{t('errors.schemaPending')}</p>
        ) : null}
        <BankingReconciliationPanelLazy
          initialAccounts={data.accounts}
          initialTransactions={data.transactions}
          defaultCurrency={data.defaultCurrency}
          canManage={data.canManage && data.persistenceReady}
        />
      </Card>
    </SettingsPageShell>
  );
}

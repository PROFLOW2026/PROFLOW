import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getContractorAccount, listExternalDirectory, requireExternalContext } from '@/modules/contractor-access';
import { ContractorPasswordForm, ContractorProfileForm } from '@/modules/contractor-access/ui/contractor-account-forms';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { contractorChangePasswordAction, contractorSignOutAction, contractorUpdateProfileAction } from './actions';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorAccess' });
  return { title: t('account.title') };
}

export default async function ContractorAccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const context = await requireExternalContext();
  const [account, directory, t, format] = await Promise.all([
    getContractorAccount(context),
    listExternalDirectory(context),
    getTranslations('contractorAccess'),
    getFormatter(),
  ]);

  return (
    <WithClientMessages extra={['auth', 'contractorAccess']}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{t('account.title')}</h1>
            <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('account.subtitle')}</p>
          </div>
          <form action={contractorSignOutAction}>
            <Button type="submit" variant="secondary">
              {t('account.signOut')}
            </Button>
          </form>
        </header>

        <Card className="p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('account.details.username')}</dt>
              <dd className="font-mono font-semibold">
                <bdi dir="ltr">{account.username}</bdi>
              </dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('account.details.lastSignIn')}</dt>
              <dd>
                {account.lastSignInAt
                  ? format.dateTime(account.lastSignInAt, { dateStyle: 'medium', timeStyle: 'short' })
                  : t('account.details.never')}
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-base font-semibold">{t('account.access.title')}</h2>
          {directory.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('account.access.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--pf-border-default)]">
              {directory.map((entry) => (
                <li key={`${entry.grantId}:${entry.subcontractAgreementId ?? 'none'}`} className="py-2 text-sm">
                  <p className="font-medium">{entry.projectName ?? t('account.access.allProjects')}</p>
                  <p className="text-[var(--pf-text-secondary)]">
                    {entry.organizationName} · {entry.vendorName}
                    {entry.agreementTitle ? ` · ${entry.agreementTitle}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <ContractorProfileForm
            action={contractorUpdateProfileAction}
            initial={{ displayName: account.displayName ?? '', phone: account.phone ?? '', locale: account.locale ?? locale }}
          />
        </Card>

        <Card className="p-4">
          <ContractorPasswordForm action={contractorChangePasswordAction} username={account.username} />
        </Card>
      </div>
    </WithClientMessages>
  );
}

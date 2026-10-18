import type { Metadata } from 'next';
import { getFormatter, getTranslations } from 'next-intl/server';
import { getContractorAccount, listExternalDirectory, requireExternalContext } from '@/modules/contractor-access';
import { ContractorPasswordForm, ContractorProfileForm } from '@/modules/contractor-access/ui/contractor-account-forms';
import {
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalPanelClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';
import { contractorChangePasswordAction, contractorUpdateProfileAction } from './actions';

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
    <WithPortalClientMessages extra={['auth', 'contractorAccess']}>
      <div className={portalPageStackClass}>
        <header className={portalPageHeaderClass}>
          <h1 className={portalPageTitleClass}>{t('account.title')}</h1>
          <p className={portalPageSubtitleClass}>{t('account.subtitle')}</p>
        </header>

        <section className={portalPanelClass}>
          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('account.details.username')}</dt>
              <dd className="font-mono font-semibold text-[var(--pf-text-primary)]">
                <bdi dir="ltr">{account.username}</bdi>
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('account.details.lastSignIn')}</dt>
              <dd className="text-[var(--pf-text-primary)]">
                {account.lastSignInAt
                  ? format.dateTime(account.lastSignInAt, { dateStyle: 'medium', timeStyle: 'short' })
                  : t('account.details.never')}
              </dd>
            </div>
          </dl>
        </section>

        <section className={portalPanelClass}>
          <h2 className="mb-3 text-base font-semibold tracking-tight text-[var(--pf-text-primary)]">
            {t('account.access.title')}
          </h2>
          {directory.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('account.access.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--pf-border-default)]">
              {directory.map((entry) => (
                <li key={`${entry.grantId}:${entry.subcontractAgreementId ?? 'none'}`} className="py-3 text-sm first:pt-0 last:pb-0">
                  <p className="font-medium text-[var(--pf-text-primary)]">
                    {entry.projectName ?? t('account.access.allProjects')}
                  </p>
                  <p className="text-[var(--pf-text-secondary)]">
                    {entry.organizationName} · {entry.vendorName}
                    {entry.agreementTitle ? ` · ${entry.agreementTitle}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={portalPanelClass}>
          <ContractorProfileForm
            action={contractorUpdateProfileAction}
            initial={{ displayName: account.displayName ?? '', phone: account.phone ?? '', locale: account.locale ?? locale }}
          />
        </section>

        <section className={portalPanelClass}>
          <ContractorPasswordForm action={contractorChangePasswordAction} username={account.username} />
        </section>
      </div>
    </WithPortalClientMessages>
  );
}

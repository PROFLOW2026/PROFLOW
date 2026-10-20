import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MainAppPage, MainAppSection, MainAppSummaryGrid, MainAppSummaryItem } from '@/components/patterns/main-app';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getProspectById } from '@/modules/crm';
import { CrmProspectContactForm } from '@/modules/crm/ui/crm-prospect-contact-form';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

const EMPTY = '—';

export async function CrmProspectDetailView({ prospectId }: { prospectId: string }) {
  const t = await getTranslations('crm');

  let prospect: Awaited<ReturnType<typeof getProspectById>>;
  let canManage = false;
  try {
    const result = await withOrgContext(async (context) => ({
      prospect: await getProspectById(context, prospectId),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
    }));
    prospect = result.prospect;
    canManage = result.canManage;
  } catch {
    notFound();
  }

  return (
    <MainAppPage>
      <PageHeader
        title={prospect.name}
        meta={
          <StatusBadge
            shape={prospect.status === 'active' ? 'active' : 'archived'}
            label={t(`statuses.prospect.${prospect.status}`)}
          />
        }
        breadcrumb={
          <Link href="/crm/prospects" className={textNavLinkMutedClassName}>
            {t('nav.prospects')}
          </Link>
        }
      />

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('prospect.companyLabel')}>
            {prospect.companyName?.trim() ? prospect.companyName : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('prospect.emailLabel')}>
            {prospect.email?.trim() ? (
              <span dir="ltr" className="pf-ltr-island">
                {prospect.email}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('prospect.phoneLabel')}>
            {prospect.phone?.trim() ? (
              <span dir="ltr" className="pf-ltr-island">
                {prospect.phone}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {prospect.notes?.trim() ? (
          <p className="mt-3 text-start text-sm text-[var(--pf-text-secondary)]">{prospect.notes}</p>
        ) : null}
        {prospect.convertedClientId ? (
          <Link
            href={`/clients/${prospect.convertedClientId}`}
            className={cn(textNavLinkClassName, 'mt-3 inline-flex text-sm')}
          >
            {t('opportunity.openClient')}
          </Link>
        ) : null}
      </MainAppSection>

      <MainAppSection title={t('prospect.contacts')}>
        {prospect.contacts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{EMPTY}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {prospect.contacts.map((contact) => (
              <li
                key={contact.id}
                className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
              >
                <p className="font-medium text-start">{contact.name}</p>
                <p className="text-start text-[var(--pf-text-secondary)]">
                  {contact.role}
                  {contact.email ? (
                    <>
                      {' · '}
                      <span dir="ltr">{contact.email}</span>
                    </>
                  ) : null}
                  {contact.phone ? (
                    <>
                      {' · '}
                      <span dir="ltr">{contact.phone}</span>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
        {canManage ? <CrmProspectContactForm prospectId={prospect.id} /> : null}
      </MainAppSection>
    </MainAppPage>
  );
}

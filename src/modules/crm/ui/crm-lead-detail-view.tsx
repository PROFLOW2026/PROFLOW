import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MainAppPage, MainAppSection, MainAppSummaryGrid, MainAppSummaryItem } from '@/components/patterns/main-app';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getLeadById } from '@/modules/crm';
import type { LeadRecord } from '@/modules/crm/domain/types';
import { CrmLeadStatusForm } from '@/modules/crm/ui/crm-lead-status-form';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

const EMPTY = '—';

export async function CrmLeadDetailView({ leadId }: { leadId: string }) {
  const t = await getTranslations('crm');

  let lead: LeadRecord;
  let canManage = false;
  try {
    const result = await withOrgContext(async (context) => ({
      lead: await getLeadById(context, leadId),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
    }));
    lead = result.lead;
    canManage = result.canManage;
  } catch {
    notFound();
  }

  return (
    <MainAppPage>
      <PageHeader
        title={lead.title}
        meta={
          <StatusBadge
            shape={lead.status === 'new' || lead.status === 'qualified' ? 'active' : 'archived'}
            label={t(`statuses.lead.${lead.status}`)}
          />
        }
        breadcrumb={
          <Link href="/crm/leads" className={textNavLinkMutedClassName}>
            {t('nav.leads')}
          </Link>
        }
      />

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('lead.sourceLabel')}>
            {lead.source?.trim() ? lead.source : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('lead.emailLabel')}>
            {lead.email?.trim() ? (
              <span dir="ltr" className="pf-ltr-island">
                {lead.email}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('lead.phoneLabel')}>
            {lead.phone?.trim() ? (
              <span dir="ltr" className="pf-ltr-island">
                {lead.phone}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {lead.notes?.trim() ? (
          <p className="mt-3 text-start text-sm text-[var(--pf-text-secondary)]">{lead.notes}</p>
        ) : null}
        {canManage ? (
          <Link
            href={`/crm/opportunities/new?leadId=${lead.id}`}
            className={cn(textNavLinkClassName, 'mt-3 inline-flex text-sm')}
          >
            {t('lead.createOpportunity')}
          </Link>
        ) : null}
      </MainAppSection>

      {canManage ? (
        <MainAppSection title={t('lead.statusSection')}>
          <CrmLeadStatusForm lead={lead} />
        </MainAppSection>
      ) : null}
    </MainAppPage>
  );
}

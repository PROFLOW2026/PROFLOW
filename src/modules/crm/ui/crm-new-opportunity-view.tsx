import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listLeadsForOrg, listProspectsForOrg } from '@/modules/crm';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { createOpportunityAction } from '@/app/[locale]/(app)/crm/actions';
import { CrmNewOpportunityForm } from '@/modules/crm/ui/crm-new-opportunity-form';
import { crmHubHref, type CrmUiSurface } from '@/modules/crm/ui/crm-surface-routes';

interface CrmNewOpportunityViewProps {
  surface?: CrmUiSurface;
  searchParams: { leadId?: string };
  createOpportunityAction?: typeof createOpportunityAction;
}

export async function CrmNewOpportunityView({
  surface = 'owner',
  searchParams,
  createOpportunityAction: createAction = createOpportunityAction,
}: CrmNewOpportunityViewProps) {
  const t = await getTranslations('crm');

  const allowed = await withOrgContext(async (context) => {
    if (surface === 'employee') {
      await assertEmployeeAppContext(context);
      return employeeHasPermission(context, PERMISSIONS.CRM_MANAGE);
    }
    return hasPermission(context, PERMISSIONS.CRM_MANAGE);
  });

  if (!allowed) notFound();

  const { prospects, leads, currency } = await withOrgContext(async (context) => {
    const [prospectRows, leadRows] = await Promise.all([
      listProspectsForOrg(context),
      listLeadsForOrg(context, { includeArchived: false }),
    ]);
    return {
      prospects: prospectRows,
      leads: leadRows,
      currency: context.organization.baseCurrency,
    };
  });

  const defaultLeadId =
    searchParams.leadId && leads.some((lead) => lead.id === searchParams.leadId)
      ? searchParams.leadId
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('opportunity.new')}
        breadcrumb={
          <Link href={crmHubHref(surface)} className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />
      <CrmNewOpportunityForm
        prospects={prospects.map((p) => ({ id: p.id, name: p.name }))}
        leads={leads.map((lead) => ({ id: lead.id, title: lead.title }))}
        defaultCurrency={currency}
        defaultLeadId={defaultLeadId}
        createOpportunityAction={createAction}
      />
    </div>
  );
}

import type { ReactNode } from 'react';
import { Handshake, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listOpportunitiesForOrg } from '@/modules/crm';
import { OpportunityPipelineViews } from '@/modules/crm/ui/opportunity-pipeline-views';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { orgListHasPermission } from '@/modules/employee-app/application/org-list-permissions';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  crmHubHref,
  crmOpportunityNewHref,
  type CrmUiSurface,
} from '@/modules/crm/ui/crm-surface-routes';

interface CrmOpportunitiesHubViewProps {
  surface?: CrmUiSurface;
  afterHeader?: ReactNode;
}

export async function CrmOpportunitiesHubView({
  surface = 'owner',
  afterHeader,
}: CrmOpportunitiesHubViewProps) {
  const t = await getTranslations('crm');

  const { opportunities, canManage, canRead } = await withOrgContext(async (context) => {
    if (surface === 'employee') {
      await assertEmployeeAppContext(context);
      const read = employeeHasPermission(context, PERMISSIONS.CRM_READ);
      if (!read) {
        return { opportunities: [], canManage: false, canRead: false };
      }
      return {
        opportunities: await listOpportunitiesForOrg(context),
        canManage: employeeHasPermission(context, PERMISSIONS.CRM_MANAGE),
        canRead: true,
      };
    }

    if (!orgListHasPermission(context, PERMISSIONS.CRM_READ, surface)) {
      return { opportunities: [], canManage: false, canRead: false };
    }

    return {
      opportunities: await listOpportunitiesForOrg(context),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
      canRead: true,
    };
  });

  const newHref = crmOpportunityNewHref(surface);
  const opportunitiesRouteBase = `${crmHubHref(surface)}/opportunities`;

  const boardItems = opportunities.map((row) => ({
    id: row.id,
    name: row.name,
    stage: row.stage,
    status: row.status,
    expectedValueAmount: row.expectedValueAmount,
    currency: row.currency,
    expectedStartDate: row.expectedStartDate,
    notes: row.notes,
    nextActionAt: row.nextActionAt,
    nextActionText: row.nextActionText,
  }));

  if (!canRead) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty.opportunities.body')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={newHref}>
                <Plus aria-hidden />
                {t('opportunity.new')}
              </Link>
            </Button>
          ) : null
        }
      />
      {afterHeader}

      {opportunities.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={t('empty.opportunities.title')}
          description={t('empty.opportunities.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href={newHref}>{t('empty.opportunities.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <OpportunityPipelineViews
          items={boardItems}
          canMoveStages={canManage}
          opportunitiesRouteBase={opportunitiesRouteBase}
        />
      )}
    </div>
  );
}

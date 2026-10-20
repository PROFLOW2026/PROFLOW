import { AdaptiveListBody, MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { ReactNode } from 'react';
import { Handshake, Plus } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listOpportunitiesForOrg } from '@/modules/crm';
import { CrmSearchForm } from '@/modules/crm/ui/crm-search-form';
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
  /** Owner list only. Employee surface ignores this. */
  search?: string;
}

export async function CrmOpportunitiesHubView({
  surface = 'owner',
  afterHeader,
  search,
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
      opportunities: await listOpportunitiesForOrg(context, {
        search: search?.trim() || undefined,
      }),
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
      <MainAppPage>
        <PageHeader title={t('title')} description={t('description')} />
      <MainAppSection>
        <EmptyState title={t('noAccess.title')} description={t('noAccess.body')} />
      
      </MainAppSection>
    </MainAppPage>
    );
  }

  return (
    <MainAppPage>
      <PageHeader
        title={t('title')}
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
      <MainAppSection>
        {afterHeader}
        <AdaptiveListBody surface={surface}>
      {surface === 'owner' ? <CrmSearchForm query={search} /> : null}

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
        </AdaptiveListBody>
      </MainAppSection>
    </MainAppPage>
  );
}

import { Handshake, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listOpportunitiesForOrg } from '@/modules/crm';
import { OpportunityPipelineViews } from '@/modules/crm/ui/opportunity-pipeline-views';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { CrmSectionNav, CrmShell } from './crm-shell';
import { CommercialDocsHub } from '@/modules/quotes/ui/commercial-docs-hub';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('title') };
}

export default async function CrmOpportunitiesPage() {
  const t = await getTranslations('crm');
  const { opportunities, canManage } = await withOrgContext(async (context) => ({
    opportunities: await listOpportunitiesForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
  }));

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

  return (
    <CrmShell>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/crm/opportunities/new">
                <Plus aria-hidden />
                {t('opportunity.new')}
              </Link>
            </Button>
          ) : null
        }
      />
      <Alert tone="info">{t('quotesVsCrmBanner')}</Alert>
      <CommercialDocsHub current="crm" />
      <CrmSectionNav active="opportunities" />

      {opportunities.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={t('empty.opportunities.title')}
          description={t('empty.opportunities.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/crm/opportunities/new">{t('empty.opportunities.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <OpportunityPipelineViews items={boardItems} canMoveStages={canManage} />
      )}
    </CrmShell>
  );
}

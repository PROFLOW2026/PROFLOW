import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getOpportunityById } from '@/modules/crm';
import { CrmOpportunityDetailView } from '@/modules/crm/ui/crm-opportunity-detail-view';
import { withOrgContext } from '@/shared/auth/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; opportunityId: string }>;
}): Promise<Metadata> {
  const { locale, opportunityId } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  try {
    const opportunity = await withOrgContext((context) => getOpportunityById(context, opportunityId));
    return { title: opportunity.name };
  } catch {
    return { title: t('nav.opportunities') };
  }
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  return <CrmOpportunityDetailView opportunityId={opportunityId} surface="owner" />;
}

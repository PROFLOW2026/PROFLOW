import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CrmNewOpportunityView } from '@/modules/crm/ui/crm-new-opportunity-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('opportunity.new') };
}

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const params = await searchParams;
  return <CrmNewOpportunityView surface="owner" searchParams={params} />;
}

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ContractsOrgListView } from '@/modules/commercial/ui/contracts-org-list-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contracts' });
  return { title: t('title') };
}

export default function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    clientId?: string;
    projectId?: string;
  }>;
}) {
  return (
    <ContractsOrgListView routeBase="/contracts" surface="owner" searchParams={searchParams} />
  );
}

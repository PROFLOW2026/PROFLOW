import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VendorsOrgListView } from '@/modules/vendors/ui/vendors-org-list-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'vendors' });
  return { title: t('title') };
}

export default function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    categoryId?: string;
    page?: string;
  }>;
}) {
  return (
    <VendorsOrgListView routeBase="/vendors" surface="owner" searchParams={searchParams} />
  );
}

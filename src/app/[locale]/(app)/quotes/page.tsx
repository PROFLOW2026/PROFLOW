import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { QuotesOrgListView } from '@/modules/quotes/ui/quotes-org-list-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quotes' });
  return { title: t('title') };
}

export default function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <QuotesOrgListView routeBase="/quotes" surface="owner" searchParams={searchParams} />
  );
}

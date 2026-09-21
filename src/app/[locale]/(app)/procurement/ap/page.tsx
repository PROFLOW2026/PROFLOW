import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ApBillsOrgListView } from '@/modules/ap/ui/ap-bills-org-list-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'ap' });
  return { title: t('title') };
}

export default function ApBillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ApBillsOrgListView
      routeBase="/procurement/ap"
      surface="owner"
      searchParams={searchParams}
    />
  );
}

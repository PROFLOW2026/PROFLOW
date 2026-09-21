import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ProcurementOrdersOrgListView } from '@/modules/procurement/ui/procurement-orders-org-list-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  return { title: t('title') };
}

export default function ProcurementPage() {
  return (
    <ProcurementOrdersOrgListView routeBase="/procurement" surface="owner" />
  );
}

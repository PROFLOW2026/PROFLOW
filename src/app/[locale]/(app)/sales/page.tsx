import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { CommercialDocsHub } from '@/modules/quotes/ui/commercial-docs-hub';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quotes' });
  return { title: t('hub.title') };
}

export default async function SalesHubPage() {
  const t = await getTranslations('quotes');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('hub.title')} description={t('hub.description')} />
      <CommercialDocsHub current="hub" />
    </div>
  );
}

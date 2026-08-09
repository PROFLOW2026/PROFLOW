import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ClientCreateForm } from './client-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('create.title') };
}

export default async function NewClientPage() {
  const t = await getTranslations('clients');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('create.title')} description={t('create.description')} />
      <ClientCreateForm />
    </div>
  );
}

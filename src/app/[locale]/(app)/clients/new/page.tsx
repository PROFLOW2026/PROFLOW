import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
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
    <MainAppPage>
      <PageHeader title={t('create.title')} description={t('create.description')} />
      <MainAppSection>
        <ClientCreateForm />
    
      </MainAppSection>
    </MainAppPage>
  );
}

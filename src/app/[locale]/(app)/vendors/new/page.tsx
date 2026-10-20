import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ContextualBackLink } from '@/components/ui/contextual-back-link';
import { NewVendorForm } from './new-vendor-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'vendors' });
  return { title: t('create.title') };
}

export default async function NewVendorPage() {
  const [t, tVendors] = await Promise.all([
    getTranslations('vendors.create'),
    getTranslations('vendors'),
  ]);

  return (
    <MainAppPage>
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumb={
          <ContextualBackLink href="/vendors">{tVendors('backToList')}</ContextualBackLink>
        }
      />
      <MainAppSection>
        <NewVendorForm />
    
      </MainAppSection>
    </MainAppPage>
  );
}

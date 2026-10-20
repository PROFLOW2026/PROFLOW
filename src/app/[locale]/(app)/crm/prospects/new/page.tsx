import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/shared/i18n/navigation';
import { CrmNewProspectForm } from '@/modules/crm/ui/crm-new-prospect-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('prospect.new') };
}

export default async function NewProspectPage() {
  const t = await getTranslations('crm');

  return (
    <MainAppPage>
      <PageHeader
        title={t('prospect.new')}
        breadcrumb={
          <Link href="/crm/prospects" className={textNavLinkMutedClassName}>
            {t('nav.prospects')}
          </Link>
        }
      />
      <MainAppSection>
        <CrmNewProspectForm />
    
      </MainAppSection>
    </MainAppPage>
  );
}

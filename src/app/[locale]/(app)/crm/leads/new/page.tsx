import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/shared/i18n/navigation';
import { NewLeadForm } from './new-lead-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('lead.new') };
}

export default async function NewLeadPage() {
  const t = await getTranslations('crm');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('lead.new')}
        breadcrumb={
          <Link href="/crm/leads" className={textNavLinkMutedClassName}>
            {t('nav.leads')}
          </Link>
        }
      />
      <NewLeadForm />
    </div>
  );
}

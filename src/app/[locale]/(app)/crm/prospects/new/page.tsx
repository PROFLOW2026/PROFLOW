import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/shared/i18n/navigation';
import { NewProspectForm } from './new-prospect-form';

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('prospect.new')}
        breadcrumb={
          <Link href="/crm/prospects" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('nav.prospects')}
          </Link>
        }
      />
      <NewProspectForm />
    </div>
  );
}

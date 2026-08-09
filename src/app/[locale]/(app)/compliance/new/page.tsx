import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/shared/i18n/navigation';
import { ArtifactForm } from '../artifact-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'compliance' });
  return { title: t('create.title') };
}

export default async function NewComplianceArtifactPage() {
  const t = await getTranslations('compliance');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <Link href="/compliance" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
      />
      <ArtifactForm mode="create" />
    </div>
  );
}

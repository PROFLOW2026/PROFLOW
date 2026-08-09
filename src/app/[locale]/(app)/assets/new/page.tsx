import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/shared/i18n/navigation';
import { AssetCreateForm } from './asset-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  return { title: t('createAsset.title') };
}

export default async function NewAssetPage() {
  const t = await getTranslations('assets');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('createAsset.title')}
        description={t('createAsset.description')}
        breadcrumb={
          <Link href="/assets" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
      />
      <AssetCreateForm />
    </div>
  );
}

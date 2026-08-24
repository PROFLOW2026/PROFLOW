import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { AssetCreateForm } from './asset-create-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

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

  const loaded = await withOrgContext(async (context) => {
    try {
      const projects = await listProjectsForOrg(context, { status: 'active' });
      return { projects, baseCurrency: context.organization.baseCurrency };
    } catch {
      return { projects: [], baseCurrency: context.organization.baseCurrency };
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('createAsset.title')}
        description={t('createAsset.description')}
        breadcrumb={
          <Link href="/assets" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />
      <AssetCreateForm
        projects={loaded.projects.map((p) => ({ id: p.id, name: p.name }))}
        defaultCurrency={loaded.baseCurrency}
      />
    </div>
  );
}

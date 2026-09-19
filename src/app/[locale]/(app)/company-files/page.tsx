import { PageHeader } from '@/components/ui/page-header';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/server';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getTranslations } from 'next-intl/server';
import { CompanyFilesHub } from './company-files-hub';

export async function generateMetadata() {
  const t = await getTranslations('externalStorage.orgFiles');
  return { title: t('title') };
}

export default async function CompanyFilesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [t, search] = await Promise.all([
    getTranslations('externalStorage.orgFiles'),
    searchParams,
  ]);
  const tab = search.tab === 'registry' ? 'registry' : 'cloud';

  const { storageConfigured, canManage } = await withOrgContext(async (context) => ({
    storageConfigured: await isOrganizationStorageConfigured(context),
    canManage: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <CompanyFilesHub
        storageConfigured={storageConfigured}
        canManage={canManage}
        initialTab={tab}
      />
    </div>
  );
}

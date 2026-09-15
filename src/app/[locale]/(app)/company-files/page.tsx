import { PageHeader } from '@/components/ui/page-header';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/server';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getTranslations } from 'next-intl/server';
import { CompanyFilesTab } from './company-files-tab';

export async function generateMetadata() {
  const t = await getTranslations('externalStorage.orgFiles');
  return { title: t('title') };
}

export default async function CompanyFilesPage() {
  const t = await getTranslations('externalStorage.orgFiles');
  const { storageConfigured, canManage } = await withOrgContext(async (context) => ({
    storageConfigured: await isOrganizationStorageConfigured(context),
    canManage: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <CompanyFilesTab storageConfigured={storageConfigured} canManage={canManage} />
    </div>
  );
}

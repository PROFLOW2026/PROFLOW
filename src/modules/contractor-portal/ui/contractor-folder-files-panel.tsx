import { FolderOpen } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import type { ContractorFolderListing } from '../application/contractor-folder-files';
import { ContractorFolderFileList } from './contractor-folder-file-list';

export async function ContractorFolderFilesPanel({
  organizationId,
  projectId,
  listing,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly listing: ContractorFolderListing;
}) {
  const t = await getTranslations('contractorPortal.folderFiles');

  if (listing.files.length === 0 && listing.subfolders.length === 0) {
    return <EmptyState icon={FolderOpen} title={t('emptyTitle')} size="sm" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('folderLabel', { name: listing.folderName })}
      </p>
      <ContractorFolderFileList
        organizationId={organizationId}
        projectId={projectId}
        listing={listing}
      />
    </div>
  );
}

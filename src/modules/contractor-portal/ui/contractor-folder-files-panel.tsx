import { FolderOpen } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { ContractorFolderListing } from '../application/contractor-folder-files';
import { CONTRACTOR_FOLDER_FILE_DOWNLOAD_PATH } from '../download-paths';

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
      {listing.subfolders.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {listing.subfolders.map((folder) => (
            <li key={folder.id}>
              <a
                href={`?sf=${encodeURIComponent(listing.folder)}&folder=${encodeURIComponent(folder.id)}`}
                className="flex min-h-12 items-center gap-2 rounded-xl border border-[var(--pf-border-default)] px-4 py-3 text-sm font-medium active:bg-[var(--pf-surface-hover)]"
              >
                <FolderOpen className="size-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
                <span className="truncate">{folder.name}</span>
                <Badge tone="neutral" className="ms-auto">
                  {t('subfolder')}
                </Badge>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {listing.files.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {listing.files.map((file) => {
            const href = `${CONTRACTOR_FOLDER_FILE_DOWNLOAD_PATH}?${new URLSearchParams({
              organizationId,
              projectId,
              folder: listing.folder,
              externalFileId: file.externalFileId,
            }).toString()}`;
            return (
              <li key={file.externalFileId}>
                <a
                  href={href}
                  className="block rounded-xl border border-[var(--pf-border-default)] p-4 active:bg-[var(--pf-surface-hover)]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <p className="truncate font-semibold text-[var(--pf-text-brand)]">{file.fileName}</p>
                  <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{file.mimeType}</p>
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

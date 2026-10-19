'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { FolderOpen } from 'lucide-react';
import { contractorFolderFileContentUrl, withExplicitAttachment } from '../download-paths';
import { AuthorizedFilePreviewDialog } from '@/modules/external-storage/ui/authorized-file-preview-dialog';

type FolderFileListListing = {
  readonly folder: string;
  readonly files: readonly {
    readonly externalFileId: string;
    readonly fileName: string;
    readonly mimeType: string;
  }[];
  readonly subfolders: readonly { readonly id: string; readonly name: string }[];
};

export function ContractorFolderFileList({
  organizationId,
  projectId,
  listing,
}: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly listing: FolderFileListListing;
}) {
  const t = useTranslations('contractorPortal.folderFiles');
  const tCommon = useTranslations('common');
  const [openId, setOpenId] = useState<string | null>(null);

  const siblings = listing.files.map((file) => ({
    fileName: file.fileName,
    contentUrl: contractorFolderFileContentUrl({
      organizationId,
      projectId,
      folder: listing.folder,
      externalFileId: file.externalFileId,
    }),
  }));
  const active = listing.files.find((file) => file.externalFileId === openId) ?? null;
  const activeUrl = active
    ? contractorFolderFileContentUrl({
        organizationId,
        projectId,
        folder: listing.folder,
        externalFileId: active.externalFileId,
      })
    : null;

  return (
    <>
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
            const contentUrl = contractorFolderFileContentUrl({
              organizationId,
              projectId,
              folder: listing.folder,
              externalFileId: file.externalFileId,
            });
            return (
              <li
                key={file.externalFileId}
                className="flex items-stretch gap-2 rounded-xl border border-[var(--pf-border-default)]"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 p-4 text-start active:bg-[var(--pf-surface-hover)]"
                  onClick={() => setOpenId(file.externalFileId)}
                >
                  <p className="truncate font-semibold text-[var(--pf-text-brand)]">{file.fileName}</p>
                  <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{file.mimeType}</p>
                </button>
                <a
                  href={withExplicitAttachment(contentUrl)}
                  download
                  className="flex shrink-0 items-center px-3 text-sm text-[var(--pf-text-secondary)] hover:underline"
                >
                  {tCommon('actions.download')}
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
      <AuthorizedFilePreviewDialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        siblings={siblings}
        file={
          active && activeUrl
            ? {
                title: active.fileName,
                fileName: active.fileName,
                mimeType: active.mimeType,
                contentUrl: activeUrl,
                downloadUrl: withExplicitAttachment(activeUrl),
              }
            : null
        }
      />
    </>
  );
}

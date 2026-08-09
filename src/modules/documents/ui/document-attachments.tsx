'use client';

import { FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useRef, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { DocumentListItem, DocumentOwnerType } from '@/modules/documents';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import {
  downloadDocumentAction,
  finalizeDocumentUploadAction,
  prepareDocumentUploadAction,
} from '../application/document-actions';

export interface DocumentAttachmentsProps {
  /** Closed enum — which entity owns these attachments. */
  ownerType: DocumentOwnerType;
  ownerId: string;
  /** Pre-loaded attachments from the server. */
  documents: readonly DocumentListItem[];
  /** Whether the viewer may download attachments. */
  canRead: boolean;
  /** Whether the viewer may upload or remove attachments. */
  canManage: boolean;
  /** When false, upload is hidden and a calm explanation is shown instead. */
  storageConfigured: boolean;
  className?: string;
}

export function DocumentAttachments({
  ownerType,
  ownerId,
  documents,
  canRead,
  canManage,
  storageConfigured,
  className,
}: DocumentAttachmentsProps) {
  const t = useTranslations('documents.attachments');
  const tFileSize = useTranslations('documents.fileSize');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadPending, startUploadTransition] = useTransition();
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(() => new Set());

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadSuccess(null);
    startUploadTransition(async () => {
      const prepared = await prepareDocumentUploadAction({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        ownerType,
        ownerId,
      });

      if (prepared.error) {
        setError(prepared.error);
        return;
      }

      if (!prepared.uploadUrl || !prepared.documentId) {
        setError(t('uploadFailed'));
        return;
      }

      const uploadResponse = await fetch(prepared.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      if (!uploadResponse.ok) {
        setError(t('uploadFailed'));
        return;
      }

      const finalized = await finalizeDocumentUploadAction({
        documentId: prepared.documentId,
        sizeBytes: file.size,
      });

      if (finalized.error) {
        setError(finalized.error);
        return;
      }

      setUploadSuccess(t('uploadSuccess'));
      router.refresh();
    });

    event.target.value = '';
  };

  const handleDownload = (documentId: string) => {
    setError(null);
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    setDownloadingIds((current) => new Set(current).add(documentId));

    void downloadDocumentAction({ documentId })
      .then((result) => {
        if (result.error || !result.url) {
          popup?.close();
          setError(result.error ?? t('downloadFailed'));
          return;
        }

        if (popup) {
          popup.location.href = result.url;
        } else {
          window.location.assign(result.url);
        }
      })
      .finally(() => {
        setDownloadingIds((current) => {
          const next = new Set(current);
          next.delete(documentId);
          return next;
        });
      });
  };

  const isDownloading = (documentId: string) => downloadingIds.has(documentId);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        {canManage && storageConfigured ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx"
              onChange={handleUpload}
              disabled={uploadPending}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={uploadPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload aria-hidden />
              {t('upload')}
            </Button>
          </>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {!storageConfigured ? (
          <Alert tone="info">{t('storageNotConfigured')}</Alert>
        ) : null}

        {uploadSuccess ? (
          <Alert tone="success" role="status" aria-live="polite">
            {uploadSuccess}
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        ) : null}

        {documents.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {documents.map((document) => (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FileText className="mt-0.5 size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{document.originalFilename}</p>
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      <span dir="ltr" className="pf-numeric">
                        {formatFileSize(document.sizeBytes, tFileSize)}
                      </span>
                      {document.label ? ` · ${document.label}` : ''}
                    </p>
                  </div>
                </div>
                {canRead && document.status === 'available' ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isDownloading(document.id) || !storageConfigured}
                    onClick={() => handleDownload(document.id)}
                  >
                    {isDownloading(document.id) ? <Spinner className="size-4" /> : t('download')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

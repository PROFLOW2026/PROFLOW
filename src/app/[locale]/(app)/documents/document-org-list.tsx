'use client';

import { FileText } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useState } from 'react';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import {
  MainAppListBody,
  MainAppTableShell,
} from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DocumentFolder, DocumentListItem } from '@/modules/documents/domain/types';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import { isBrowserPreviewableImageMime } from '@/modules/documents/domain/file-rules';
import {
  downloadDocumentAction,
  softDeleteDocumentAction,
} from '@/modules/documents/application/document-actions';
import { DocumentExpiryBadge, DocumentRequiredBadge } from '@/modules/documents/ui/document-expiry-badge';
import { DocumentVersionHistoryDialog } from '@/modules/documents/ui/document-version-history-dialog';
import { mainAppCardClass } from '@/shared/ui/main-app-surface-styles';
import { cn } from '@/shared/ui/cn';

const DocumentPreviewDialog = dynamic(
  () =>
    import('@/modules/documents/ui/document-preview-dialog').then((mod) => mod.DocumentPreviewDialog),
  { ssr: false },
);

function documentStatusShape(status: string): 'pending' | 'active' | 'void' {
  if (status === 'pending') return 'pending';
  if (status === 'deleted') return 'void';
  return 'active';
}

export interface DocumentOrgListProps {
  documents: readonly DocumentListItem[];
  canRead: boolean;
  canManage: boolean;
  storageConfigured: boolean;
  folders?: readonly DocumentFolder[];
}

export function DocumentOrgList({
  documents,
  canRead,
  canManage,
  storageConfigured,
  folders = [],
}: DocumentOrgListProps) {
  const t = useTranslations('documents');
  const tAttach = useTranslations('documents.attachments');
  const tFileSize = useTranslations('documents.fileSize');
  const tCommon = useTranslations('common');
  const tExpenses = useTranslations('expenses');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [previewDoc, setPreviewDoc] = useState<{ id: string; filename: string } | null>(null);
  const [historyDoc, setHistoryDoc] = useState<DocumentListItem | null>(null);

  const handleDownload = (documentId: string) => {
    setError(null);
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    setDownloadingIds((current) => new Set(current).add(documentId));

    void downloadDocumentAction({ documentId })
      .then((result) => {
        if (result.error || !result.url) {
          popup?.close();
          setError(result.error ?? tAttach('downloadFailed'));
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

  const renderRowActions = (document: DocumentListItem) => {
    const canPreview =
      canRead &&
      document.status === 'available' &&
      storageConfigured &&
      isBrowserPreviewableImageMime(document.mimeType);

    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        {canRead ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryDoc(document)}
          >
            {tAttach('versions')}
          </Button>
        ) : null}
        {canPreview ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setPreviewDoc({ id: document.id, filename: document.originalFilename })
            }
          >
            {tAttach('preview')}
          </Button>
        ) : null}
        {canRead && document.status === 'available' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={downloadingIds.has(document.id) || !storageConfigured}
            onClick={() => handleDownload(document.id)}
          >
            {downloadingIds.has(document.id) ? (
              <Spinner className="size-4" />
            ) : (
              tCommon('actions.download')
            )}
          </Button>
        ) : null}
        {canManage && document.status !== 'deleted' ? (
          <ConfirmAction
            title={tAttach('deleteTitle')}
            description={<p>{tAttach('deleteBody')}</p>}
            confirmLabel={tCommon('actions.delete')}
            successMessage={tAttach('deleteSuccess')}
            onConfirm={async () => {
              const result = await softDeleteDocumentAction({ documentId: document.id });
              if (result.error) return { error: result.error };
              router.refresh();
              return { ok: true };
            }}
            trigger={
              <Button type="button" variant="ghost" size="sm">
                {tCommon('actions.delete')}
              </Button>
            }
          />
        ) : null}
      </div>
    );
  };

  return (
    <MainAppListBody className="flex flex-col gap-3">
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      <ResponsiveTable
        items={documents}
        getRowKey={(document) => document.id}
        desktop={
          <MainAppTableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tAttach('title')}</TableHead>
                  <TableHead>{tAttach('labelOptional')}</TableHead>
                  <TableHead>{t('list.tagsFilter')}</TableHead>
                  <TableHead>{tExpenses('fields.status')}</TableHead>
                  <TableHead className="w-[1%] text-end">
                    <span className="sr-only">{tCommon('actions.download')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="max-w-[16rem]">
                      <div className="flex min-w-0 items-start gap-2">
                        <FileText
                          className="mt-0.5 size-4 shrink-0 text-[var(--pf-text-muted)]"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{document.originalFilename}</p>
                          <p className="text-sm text-[var(--pf-text-secondary)]">
                            <span dir="ltr" className="pf-numeric">
                              {formatFileSize(document.sizeBytes, tFileSize)}
                            </span>
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[var(--pf-text-secondary)]">
                      {document.label ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <DocumentExpiryBadge expiresAt={document.expiresAt} />
                        <DocumentRequiredBadge isRequired={document.isRequired} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        shape={documentStatusShape(document.status)}
                        label={t(`status.${document.status}`)}
                      />
                    </TableCell>
                    <TableCell className="text-end">{renderRowActions(document)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </MainAppTableShell>
        }
        renderMobileCard={(document) => (
          <div className={cn(mainAppCardClass, 'flex flex-col gap-2 p-4')}>
            <div className="flex min-w-0 items-start gap-2">
              <FileText className="mt-0.5 size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{document.originalFilename}</p>
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  <span dir="ltr" className="pf-numeric">
                    {formatFileSize(document.sizeBytes, tFileSize)}
                  </span>
                  {document.label ? ` · ${document.label}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <DocumentExpiryBadge expiresAt={document.expiresAt} />
                  <DocumentRequiredBadge isRequired={document.isRequired} />
                </div>
              </div>
              <StatusBadge
                shape={documentStatusShape(document.status)}
                label={t(`status.${document.status}`)}
              />
            </div>
            {renderRowActions(document)}
          </div>
        )}
      />

      {previewDoc ? (
        <DocumentPreviewDialog
          open
          documentId={previewDoc.id}
          filename={previewDoc.filename}
          onOpenChange={(open) => {
            if (!open) setPreviewDoc(null);
          }}
        />
      ) : null}

      {historyDoc ? (
        <DocumentVersionHistoryDialog
          open
          document={historyDoc}
          canManage={canManage}
          storageConfigured={storageConfigured}
          folders={folders}
          onOpenChange={(open) => {
            if (!open) setHistoryDoc(null);
          }}
        />
      ) : null}
    </MainAppListBody>
  );
}

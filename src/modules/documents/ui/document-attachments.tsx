'use client';

import { Camera, FileText, Upload } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useRef, useState, useTransition } from 'react';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import type { DocumentListItem, DocumentLinkCandidate, DocumentOwnerType } from '@/modules/documents/domain/types';
import { DOCUMENT_CATEGORIES } from '@/modules/documents/domain/categories';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import { isBrowserPreviewableMime } from '@/modules/documents/domain/file-rules';
import { OfflineCaptureError } from '@/modules/offline/domain/capture';
import { enqueueCaptureDraft } from '@/modules/offline';
import { isBrowserOnline } from '@/modules/offline';
import { useOfflineOrganizationId } from '@/modules/offline/ui/use-offline-aware-form-action';
import {
  downloadDocumentAction,
  finalizeDocumentUploadAction,
  linkDocumentAction,
  prepareDocumentUploadAction,
  softDeleteDocumentAction,
  unlinkDocumentAction,
} from '../application/document-actions';

const DocumentPreviewDialog = dynamic(
  () => import('./document-preview-dialog').then((mod) => mod.DocumentPreviewDialog),
  { ssr: false },
);

export interface DocumentAttachmentsProps {
  /** Closed enum — which entity owns these attachments. */
  ownerType: DocumentOwnerType;
  ownerId: string;
  /** Pre-loaded attachments from the server. */
  documents: readonly DocumentListItem[];
  /** Org documents that can be linked without a new upload. */
  linkCandidates?: readonly DocumentLinkCandidate[];
  /** Whether the viewer may download attachments. */
  canRead: boolean;
  /** Whether the viewer may upload or remove attachments. */
  canManage: boolean;
  /** When false, upload is hidden and a calm explanation is shown instead. */
  storageConfigured: boolean;
  /** Optional title override (e.g. contract documents on a project). */
  titleKey?: 'title' | 'contractTitle';
  /** Prefill category stored on the link label. */
  defaultCategory?: (typeof DOCUMENT_CATEGORIES)[number] | '';
  /** Optional hook after a successful upload finalize (e.g. set compliance.document_id). */
  afterFinalizeAction?: (documentId: string) => Promise<{ error?: string }>;
  className?: string;
}

function statusShape(status: string): 'pending' | 'active' | 'void' {
  if (status === 'pending') return 'pending';
  if (status === 'deleted') return 'void';
  return 'active';
}

export function DocumentAttachments({
  ownerType,
  ownerId,
  documents,
  linkCandidates = [],
  canRead,
  canManage,
  storageConfigured,
  titleKey = 'title',
  defaultCategory = '',
  afterFinalizeAction,
  className,
}: DocumentAttachmentsProps) {
  const t = useTranslations('documents.attachments');
  const tStatus = useTranslations('documents.status');
  const tCategories = useTranslations('documents.categories');
  const tFileSize = useTranslations('documents.fileSize');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');
  const router = useRouter();
  const organizationId = useOfflineOrganizationId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<string>(defaultCategory);
  const [uploadPending, startUploadTransition] = useTransition();
  const [linkPending, startLinkTransition] = useTransition();
  const [selectedLinkId, setSelectedLinkId] = useState<string>('');
  const [downloadingIds, setDownloadingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [dragActive, setDragActive] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    filename: string;
    mimeType: string;
  } | null>(null);

  const resolveLinkLabel = () => {
    const note = label.trim();
    if (category && note) return `${category}: ${note}`;
    if (category) return category;
    return note || null;
  };

  const uploadFile = (file: File) => {
    setError(null);
    setUploadSuccess(null);
    startUploadTransition(async () => {
      if (!isBrowserOnline()) {
        if (!organizationId) {
          setError(tOffline('errors.missingOrganization'));
          return;
        }
        // afterFinalize mutates a linked server record — require online.
        if (afterFinalizeAction) {
          setError(tOffline('forms.captureFinalizeRequiresOnline'));
          return;
        }
        try {
          await enqueueCaptureDraft({
            organizationId,
            file,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            ownerType,
            ownerId,
            note: resolveLinkLabel(),
          });
          setLabel('');
          setUploadSuccess(tOffline('forms.captureDraftSaved'));
        } catch (err) {
          if (err instanceof OfflineCaptureError) {
            setError(err.message);
            return;
          }
          setError(t('uploadFailed'));
        }
        return;
      }

      const prepared = await prepareDocumentUploadAction({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        ownerType,
        ownerId,
        label: resolveLinkLabel(),
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

      if (afterFinalizeAction) {
        const after = await afterFinalizeAction(prepared.documentId);
        if (after.error) {
          setError(after.error);
          return;
        }
      }

      setLabel('');
      setUploadSuccess(t('uploadSuccess'));
      router.refresh();
    });
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadFile(file);
    event.target.value = '';
  };

  const handleLinkExisting = () => {
    if (!selectedLinkId) return;
    setError(null);
    setUploadSuccess(null);
    startLinkTransition(async () => {
      const result = await linkDocumentAction({
        documentId: selectedLinkId,
        ownerType,
        ownerId,
        label: resolveLinkLabel(),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (afterFinalizeAction) {
        const after = await afterFinalizeAction(selectedLinkId);
        if (after.error) {
          setError(after.error);
          return;
        }
      }

      setSelectedLinkId('');
      setLabel('');
      setUploadSuccess(t('linkSuccess'));
      router.refresh();
    });
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
  const showLinkExisting = canManage && linkCandidates.length > 0;
  const showManageUpload = canManage && storageConfigured;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">{t(titleKey)}</CardTitle>
        {showManageUpload ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,image/*"
              onChange={handleUpload}
              disabled={uploadPending}
            />
            <input
              ref={captureInputRef}
              type="file"
              className="sr-only"
              accept="image/*"
              capture="environment"
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploadPending}
              onClick={() => captureInputRef.current?.click()}
            >
              <Camera aria-hidden />
              {t('capture')}
            </Button>
          </div>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {showManageUpload ? (
          <>
            <Field label={t('categoryOptional')} optionalLabel={tCommon('labels.optional')}>
              {(control) => (
                <>
                  <input type="hidden" name="category" value={category} />
                  <Select
                    value={category || 'none'}
                    onValueChange={(value) => setCategory(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue placeholder={t('categoryPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('categoryNone')}</SelectItem>
                      {DOCUMENT_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {tCategories(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
            <Field label={t('labelOptional')} optionalLabel={tCommon('labels.optional')}>
              {(control) => (
                <Input
                  {...control}
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={t('labelPlaceholder')}
                  maxLength={200}
                  disabled={uploadPending || linkPending}
                />
              )}
            </Field>
            <div
              role="button"
              tabIndex={0}
              aria-label={t('dropzone')}
              aria-busy={uploadPending}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragActive(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const file = event.dataTransfer.files?.[0];
                if (file) uploadFile(file);
              }}
              className={`rounded-md border border-dashed px-3 py-6 text-center text-sm transition-colors ${
                dragActive
                  ? 'border-[var(--pf-text-brand)] bg-[var(--pf-teal-50)]'
                  : 'border-[var(--pf-border-default)] text-[var(--pf-text-secondary)]'
              } ${uploadPending ? 'opacity-70' : ''}`}
            >
              {uploadPending ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" />
                  {t('uploading')}
                </span>
              ) : (
                t('dropzone')
              )}
            </div>
          </>
        ) : null}

        {showLinkExisting ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Select value={selectedLinkId || undefined} onValueChange={setSelectedLinkId}>
                <SelectTrigger aria-label={t('linkSelectPlaceholder')}>
                  <SelectValue placeholder={t('linkSelectPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {linkCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.originalFilename}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={linkPending}
              disabled={!selectedLinkId}
              onClick={handleLinkExisting}
            >
              {t('linkExisting')}
            </Button>
          </div>
        ) : null}

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
          <EmptyState size="sm" title={t('empty')} description={t('dropzone')} className="py-6" />
        ) : (
          <ul className="flex flex-col gap-2">
            {documents.map((document) => {
              const canPreview =
                canRead &&
                document.status === 'available' &&
                storageConfigured &&
                isBrowserPreviewableMime(document.mimeType);

              return (
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
                      {document.status !== 'available' ? (
                        <div className="mt-1">
                          <StatusBadge
                            shape={statusShape(document.status)}
                            label={tStatus(document.status)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {canPreview ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPreviewDoc({
                            id: document.id,
                            filename: document.originalFilename,
                            mimeType: document.mimeType,
                          })
                        }
                      >
                        {t('preview')}
                      </Button>
                    ) : null}
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
                    {canManage && document.linkId ? (
                      <ConfirmAction
                        title={t('unlinkTitle')}
                        description={<p>{t('unlinkBody')}</p>}
                        confirmLabel={t('unlink')}
                        successMessage={t('unlinkSuccess')}
                        onConfirm={async () => {
                          const result = await unlinkDocumentAction({ linkId: document.linkId! });
                          if (result.error) return { error: result.error };
                          router.refresh();
                          return { ok: true };
                        }}
                        trigger={
                          <Button type="button" variant="ghost" size="sm">
                            {t('unlink')}
                          </Button>
                        }
                      />
                    ) : null}
                    {canManage ? (
                      <ConfirmAction
                        title={t('deleteTitle')}
                        description={<p>{t('deleteBody')}</p>}
                        confirmLabel={tCommon('actions.delete')}
                        successMessage={t('deleteSuccess')}
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
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {previewDoc ? (
        <DocumentPreviewDialog
          open
          documentId={previewDoc.id}
          filename={previewDoc.filename}
          mimeType={previewDoc.mimeType}
          onOpenChange={(open) => {
            if (!open) setPreviewDoc(null);
          }}
        />
      ) : null}
    </Card>
  );
}

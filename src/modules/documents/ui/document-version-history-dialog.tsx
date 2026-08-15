'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { DOCUMENT_CATEGORIES } from '../domain/categories';
import { formatFileSize } from '../domain/format-file-size';
import { normalizeUploadMime } from '../domain/file-rules';
import type { DocumentFolder, DocumentListItem, DocumentVersion } from '../domain/types';
import { openFilePicker } from '../client/open-file-picker';
import { uploadDocumentBytes } from '../client/upload-document-bytes';
import {
  downloadDocumentVersionAction,
  finalizeNewVersionUploadAction,
  listDocumentVersionsAction,
  prepareNewVersionUploadAction,
  setDocumentMetadataAction,
} from '../application/document-actions';

export interface DocumentVersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Pick<
    DocumentListItem,
    'id' | 'originalFilename' | 'category' | 'tags' | 'expiresAt' | 'isRequired' | 'folderId' | 'status'
  >;
  canManage: boolean;
  storageConfigured: boolean;
  folders?: readonly DocumentFolder[];
}

export function DocumentVersionHistoryDialog({
  open,
  onOpenChange,
  document,
  canManage,
  storageConfigured,
  folders = [],
}: DocumentVersionHistoryDialogProps) {
  const t = useTranslations('documents.versions');
  const tMeta = useTranslations('documents.meta');
  const tAttach = useTranslations('documents.attachments');
  const tCategories = useTranslations('documents.categories');
  const tFileSize = useTranslations('documents.fileSize');
  const tErrors = useTranslations('documents.errors');
  const tCommon = useTranslations('common');
  const tFolders = useTranslations('documents.folders');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [versions, setVersions] = useState<readonly DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [category, setCategory] = useState(document.category ?? '');
  const [tags, setTags] = useState(document.tags ?? '');
  const [expiresAt, setExpiresAt] = useState(document.expiresAt ?? '');
  const [isRequired, setIsRequired] = useState(document.isRequired);
  const [folderId, setFolderId] = useState(document.folderId ?? '');
  const [uploadPending, startUpload] = useTransition();
  const [savePending, startSave] = useTransition();

  useEffect(() => {
    if (!open) return;
    setCategory(document.category ?? '');
    setTags(document.tags ?? '');
    setExpiresAt(document.expiresAt ?? '');
    setIsRequired(document.isRequired);
    setFolderId(document.folderId ?? '');
    setError(null);
    setSuccess(null);
    setLoading(true);
    void listDocumentVersionsAction({ documentId: document.id }).then((result) => {
      setLoading(false);
      if (result.error) {
        setError(result.error);
        setVersions([]);
        return;
      }
      setVersions(result.versions ?? []);
    });
  }, [open, document]);

  const handleSaveMeta = () => {
    setError(null);
    startSave(async () => {
      const result = await setDocumentMetadataAction({
        documentId: document.id,
        category: category || null,
        tags: tags.trim() || null,
        expiresAt: expiresAt || null,
        isRequired,
        folderId: folderId || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(tMeta('saveSuccess'));
      router.refresh();
    });
  };

  const handleUploadVersion = (file: File) => {
    setError(null);
    setSuccess(null);
    startUpload(async () => {
      const mime = normalizeUploadMime(file.type, file.name);
      if (!mime.ok) {
        setError(tErrors('mimeNotAllowed'));
        return;
      }
      const prepared = await prepareNewVersionUploadAction({
        documentId: document.id,
        fileName: file.name,
        mimeType: mime.mimeType,
        sizeBytes: file.size,
      });
      if (prepared.error || !prepared.uploadUrl || !prepared.uploadPath) {
        setError(prepared.error ?? t('uploadFailed'));
        return;
      }
      const uploaded = await uploadDocumentBytes(
        {
          uploadUrl: prepared.uploadUrl,
          uploadToken: prepared.uploadToken,
          uploadPath: prepared.uploadPath,
          uploadBucket: prepared.uploadBucket,
        },
        file,
        { contentType: mime.mimeType },
      );
      if (!uploaded.ok) {
        setError(t('uploadFailed'));
        return;
      }
      const finalized = await finalizeNewVersionUploadAction({
        documentId: document.id,
        storagePath: prepared.uploadPath,
        originalFilename: file.name,
        mimeType: mime.mimeType,
        sizeBytes: file.size,
      });
      if (finalized.error) {
        setError(finalized.error);
        return;
      }
      setSuccess(t('uploadSuccess'));
      const listed = await listDocumentVersionsAction({ documentId: document.id });
      setVersions(listed.versions ?? []);
      router.refresh();
    });
  };

  const handleDownloadVersion = (versionId: string) => {
    setError(null);
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    void downloadDocumentVersionAction({ versionId }).then((result) => {
      if (result.error || !result.url) {
        popup?.close();
        setError(result.error ?? t('downloadFailed'));
        return;
      }
      if (popup) popup.location.href = result.url;
      else window.location.assign(result.url);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon('actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription dir="ltr" style={{ unicodeBidi: 'isolate' }}>
            {document.originalFilename}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('keepOldHint')}</p>

          {canManage ? (
            <div className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
              <Field label={tAttach('categoryOptional')}>
                {(control) => (
                  <Select value={category || 'none'} onValueChange={(value) => setCategory(value === 'none' ? '' : value)}>
                    <SelectTrigger id={control.id}>
                      <SelectValue placeholder={tAttach('categoryPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tAttach('categoryNone')}</SelectItem>
                      {DOCUMENT_CATEGORIES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {tCategories(item)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field label={tMeta('tags')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Input
                    {...control}
                    value={tags}
                    onChange={(event) => setTags(event.target.value)}
                    placeholder={tMeta('tagsPlaceholder')}
                    maxLength={500}
                  />
                )}
              </Field>
              <Field label={tMeta('expires')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                )}
              </Field>
              {folders.length > 0 ? (
                <Field label={tMeta('folder')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => (
                    <Select
                      value={folderId || 'none'}
                      onValueChange={(value) => setFolderId(value === 'none' ? '' : value)}
                    >
                      <SelectTrigger id={control.id}>
                        <SelectValue placeholder={tFolders('none')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{tFolders('none')}</SelectItem>
                        {folders.map((folder) => (
                          <SelectItem key={folder.id} value={folder.id}>
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              ) : null}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`required-${document.id}`}
                  checked={isRequired}
                  onCheckedChange={(value) => setIsRequired(value === true)}
                />
                <Label htmlFor={`required-${document.id}`}>{tMeta('required')}</Label>
              </div>
              <Button type="button" variant="secondary" size="sm" loading={savePending} onClick={handleSaveMeta}>
                {tMeta('save')}
              </Button>
            </div>
          ) : null}

          {success ? (
            <Alert tone="success" role="status">
              {success}
            </Alert>
          ) : null}
          {error ? (
            <Alert tone="danger" role="alert">
              {error}
            </Alert>
          ) : null}

          {canManage && storageConfigured && document.status === 'available' ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.xls,.xlsx,image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleUploadVersion(file);
                  event.target.value = '';
                }}
                disabled={uploadPending}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={uploadPending}
                onClick={() => openFilePicker(fileInputRef.current)}
              >
                {t('uploadNew')}
              </Button>
            </>
          ) : null}

          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Spinner className="size-6" />
            </div>
          ) : versions.length === 0 ? (
            <EmptyState size="sm" title={t('empty')} className="py-6" />
          ) : (
            <ul className="flex flex-col gap-2">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t('versionLabel', { number: version.versionNumber })}</p>
                    <p
                      dir="ltr"
                      className="truncate text-xs text-[var(--pf-text-muted)]"
                      style={{ unicodeBidi: 'isolate' }}
                    >
                      {version.originalFilename}
                    </p>
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      <span dir="ltr" className="pf-numeric">
                        {formatFileSize(version.sizeBytes, tFileSize)}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {version.isCurrent ? <StatusBadge shape="active" label={t('current')} /> : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadVersion(version.id)}
                    >
                      {tAttach('download')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {tCommon('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

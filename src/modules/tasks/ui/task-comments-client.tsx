'use client';

/**
 * Client components for task comments:
 *   - CommentFormClient: add-comment form with multi-attachment upload
 *   - CommentAttachmentsGallery: image gallery + document links per comment
 *   - CommentActionsClient: edit / delete actions for own comments
 */

import dynamic from 'next/dynamic';
import { useRouter } from '@/shared/i18n/navigation';
import { Camera, Cloud, FileText, Paperclip, Pencil, Trash2, X } from 'lucide-react';
import { useActionState, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/shared/ui/cn';
import {
  finalizeDocumentUploadAction,
  prepareDocumentUploadAction,
  softDeleteDocumentAction,
  downloadDocumentAction,
} from '@/modules/documents/application/document-actions';
import { openFilePicker } from '@/modules/documents/client/open-file-picker';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import { buildDocumentContentPath } from '@/modules/documents/domain/content-path';
import { isBrowserPreviewableImageMime, normalizeUploadMime } from '@/modules/documents/domain/file-rules';
import { useTranslateDocumentApiError } from '@/modules/documents/client/use-translate-document-api-error';
import type { TaskCommentAttachmentDisplay } from '@/modules/tasks/application/load-task-comments-for-display';
import {
  browseProjectFolderAction,
  loadProjectFileBrowserInitialAction,
} from '@/app/[locale]/(app)/projects/[projectId]/project-files-actions';
import type { ProjectCloudFileRef } from '@/modules/external-storage/client';
import { ProjectCloudFilePicker } from '@/modules/external-storage/client';
import { createMainAppProjectCloudBrowserActions } from '@/modules/external-storage/client/project-cloud-file-browser-actions';
import type { TaskActionState } from './actions';

const DocumentPreviewDialog = dynamic(
  () => import('@/modules/documents/ui/document-preview-dialog').then((mod) => mod.DocumentPreviewDialog),
  { ssr: false },
);

const COMMENT_FILE_ACCEPT =
  'image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type PendingFile = {
  id: string;
  file: File;
  previewUrl: string | null;
};

function makePendingFile(file: File): PendingFile {
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
  return { id: `${file.name}-${file.size}-${file.lastModified}`, file, previewUrl };
}

async function uploadCommentAttachment(
  commentId: string,
  file: File,
  translateError: (key: string | undefined, fallback: string) => string,
  tUploadFailed: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const mime = normalizeUploadMime(file.type, file.name);
  if (!mime.ok) {
    return { ok: false, message: tUploadFailed };
  }

  const prepared = await prepareDocumentUploadAction({
    fileName: file.name,
    mimeType: mime.mimeType,
    sizeBytes: file.size,
    ownerType: 'task_comment',
    ownerId: commentId,
  });

  if (prepared.error || !prepared.documentId || !prepared.uploadUrl) {
    return { ok: false, message: prepared.error ?? tUploadFailed };
  }

  const documentId = prepared.documentId;
  const uploaded = await uploadDocumentBytes(
    {
      uploadUrl: prepared.uploadUrl,
      uploadMode: prepared.uploadMode,
      uploadToken: prepared.uploadToken,
      uploadPath: prepared.uploadPath,
      uploadBucket: prepared.uploadBucket,
    },
    file,
    { contentType: mime.mimeType },
  );

  if (!uploaded.ok) {
    await softDeleteDocumentAction({ documentId });
    return { ok: false, message: translateError(uploaded.messageKey, tUploadFailed) };
  }

  const finalized = await finalizeDocumentUploadAction({
    documentId,
    sizeBytes: file.size,
  });

  if (finalized.error) {
    await softDeleteDocumentAction({ documentId });
    return { ok: false, message: finalized.error };
  }

  return { ok: true };
}

// ─── Attachment gallery (read) ─────────────────────────────────────────────────

export function CommentAttachmentsGallery({
  attachments,
  className,
}: {
  attachments: readonly TaskCommentAttachmentDisplay[];
  className?: string;
}) {
  const t = useTranslations('tasks.comments.attachments');
  const [previewDoc, setPreviewDoc] = useState<{
    id: string;
    filename: string;
    mimeType: string;
  } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const images = attachments.filter((doc) => isBrowserPreviewableImageMime(doc.mimeType));
  const documents = attachments.filter((doc) => !isBrowserPreviewableImageMime(doc.mimeType));

  const handleDownload = (documentId: string) => {
    setDownloadingId(documentId);
    void downloadDocumentAction({ documentId })
      .then((result) => {
        if (result.url) {
          window.open(result.url, '_blank', 'noopener,noreferrer');
        }
      })
      .finally(() => setDownloadingId(null));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {images.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {images.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                className="relative block size-20 overflow-hidden rounded-md border border-[var(--pf-border-subtle)] bg-[var(--pf-surface-2)]"
                onClick={() =>
                  setPreviewDoc({
                    id: doc.id,
                    filename: doc.originalFilename,
                    mimeType: doc.mimeType,
                  })
                }
                aria-label={t('preview')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildDocumentContentPath(doc.id, 'inline')}
                  alt={t('imageAlt', { name: doc.originalFilename })}
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {documents.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {documents.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-[var(--pf-text-brand)] hover:underline"
                onClick={() => handleDownload(doc.id)}
                disabled={downloadingId === doc.id}
              >
                {downloadingId === doc.id ? (
                  <Spinner className="size-3.5" />
                ) : (
                  <FileText className="size-3.5 shrink-0" aria-hidden />
                )}
                <span className="truncate">{doc.originalFilename}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <DocumentPreviewDialog
        open={previewDoc !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewDoc(null);
        }}
        documentId={previewDoc?.id ?? ''}
        filename={previewDoc?.filename ?? ''}
        mimeType={previewDoc?.mimeType ?? ''}
      />
    </div>
  );
}

// ─── Add Comment Form ──────────────────────────────────────────────────────────

export function CommentFormClient({
  taskId,
  projectId = null,
  canBrowseCloudFiles = false,
  action,
  placeholderText,
  submitLabel,
  className,
  textareaClassName,
  submitClassName,
}: {
  taskId: string;
  projectId?: string | null;
  canBrowseCloudFiles?: boolean;
  action: (prev: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  placeholderText: string;
  submitLabel: string;
  className?: string;
  textareaClassName?: string;
  submitClassName?: string;
}) {
  const tAttach = useTranslations('tasks.comments.attachments');
  const tDocsErrors = useTranslations('documents.errors');
  const { translate: translateDocumentApiError } = useTranslateDocumentApiError();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [formGeneration, setFormGeneration] = useState(0);
  const [uploadPending, startUpload] = useTransition();
  const [pendingCloudFiles, setPendingCloudFiles] = useState<
    Array<ProjectCloudFileRef & { id: string }>
  >([]);
  const [cloudPickerOpen, setCloudPickerOpen] = useState(false);
  const cloudFileBrowserActions = useMemo(
    () =>
      createMainAppProjectCloudBrowserActions({
        loadInitial: loadProjectFileBrowserInitialAction,
        browseFolder: browseProjectFolderAction,
      }),
    [],
  );

  const resetForm = () => {
    formRef.current?.reset();
    for (const item of pendingFiles) {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    setPendingFiles([]);
    setPendingCloudFiles([]);
    setLocalError(null);
    setPartialError(null);
    setUploadLabel(null);
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setLocalError(null);
    setPendingFiles((current) => {
      const next = [...current];
      for (const file of files) {
        const id = `${file.name}-${file.size}-${file.lastModified}`;
        if (next.some((item) => item.id === id)) continue;
        next.push(makePendingFile(file));
      }
      return next;
    });
  };

  const removeFile = (id: string) => {
    setPendingFiles((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return current.filter((entry) => entry.id !== id);
    });
  };

  const uploadAttachments = async (commentId: string, files: readonly PendingFile[]) => {
    if (files.length === 0) return { failed: 0 };

    let failed = 0;
    for (let index = 0; index < files.length; index += 1) {
      setUploadLabel(
        tAttach('uploading', { current: index + 1, total: files.length }),
      );
      const result = await uploadCommentAttachment(
        commentId,
        files[index]!.file,
        translateDocumentApiError,
        tDocsErrors('uploadFailed'),
      );
      if (!result.ok) failed += 1;
    }
    setUploadLabel(null);
    return { failed };
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    setPartialError(null);

    const formData = new FormData(event.currentTarget);
    const body = String(formData.get('body') ?? '').trim();

    if (!body && pendingFiles.length === 0 && pendingCloudFiles.length === 0) {
      setLocalError(tAttach('attachmentOnlyHint'));
      return;
    }

    startUpload(async () => {
      if (projectId && pendingCloudFiles.length > 0) {
        formData.set(
          'providerFileRefs',
          JSON.stringify(
            pendingCloudFiles.map((file) => ({
              projectId,
              providerFileId: file.providerFileId,
              fileName: file.fileName,
              mimeType: file.mimeType,
              parentFolderId: file.parentFolderId,
            })),
          ),
        );
      }
      const createState = await action({} as TaskActionState, formData);
      if (createState.error) {
        setLocalError(createState.error);
        return;
      }
      if (createState.partialError) {
        setPartialError(createState.partialError);
      }
      if (!createState.commentId) {
        resetForm();
        setFormGeneration((value) => value + 1);
        router.refresh();
        return;
      }

      const { failed } = await uploadAttachments(createState.commentId, pendingFiles);
      resetForm();
      setFormGeneration((value) => value + 1);
      router.refresh();

      if (failed > 0 && failed < pendingFiles.length) {
        setPartialError(tAttach('partialSuccess', { count: failed }));
      } else if (failed === pendingFiles.length && pendingFiles.length > 0) {
        setLocalError(tAttach('uploadFailed'));
      }
    });
  };

  const busy = uploadPending;
  const displayError = localError;

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      key={formGeneration}
      className={cn('flex flex-col gap-2', className)}
    >
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="pendingAttachmentCount" value={pendingFiles.length} />
      <Textarea
        name="body"
        placeholder={placeholderText}
        rows={3}
        maxLength={20_000}
        className={cn('min-h-20', textareaClassName)}
        aria-label={placeholderText}
        disabled={busy}
      />

      {pendingCloudFiles.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {pendingCloudFiles.map((item) => (
            <li
              key={item.id}
              className="relative flex min-h-20 min-w-[8rem] max-w-full items-center gap-2 rounded-md border border-[var(--pf-border-subtle)] bg-[var(--pf-surface-2)] px-2 py-1.5"
            >
              <Cloud className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{item.fileName}</span>
              <button
                type="button"
                className="shrink-0 rounded-full bg-[var(--pf-bg-surface)] p-0.5 shadow-sm"
                onClick={() =>
                  setPendingCloudFiles((current) => current.filter((entry) => entry.id !== item.id))
                }
                aria-label={tAttach('remove', { name: item.fileName })}
                disabled={busy}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {pendingFiles.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {pendingFiles.map((item) => (
            <li
              key={item.id}
              className="relative flex size-20 items-center justify-center overflow-hidden rounded-md border border-[var(--pf-border-subtle)] bg-[var(--pf-surface-2)]"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={tAttach('imageAlt', { name: item.file.name })}
                  className="size-full object-cover"
                />
              ) : (
                <FileText className="size-6 text-[var(--pf-text-muted)]" aria-hidden />
              )}
              <button
                type="button"
                className="absolute inset-e-0.5 top-0.5 rounded-full bg-[var(--pf-bg-surface)] p-0.5 shadow-sm"
                onClick={() => removeFile(item.id)}
                aria-label={tAttach('remove', { name: item.file.name })}
                disabled={busy}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        multiple
        accept={COMMENT_FILE_ACCEPT}
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={busy}
      />
      <input
        ref={captureInputRef}
        type="file"
        className="sr-only"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
        disabled={busy}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => openFilePicker(fileInputRef.current)}
          >
            <Paperclip aria-hidden />
            {tAttach('addFiles')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => openFilePicker(captureInputRef.current)}
          >
            <Camera aria-hidden />
            {tAttach('takePhoto')}
          </Button>
          {canBrowseCloudFiles && projectId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setCloudPickerOpen(true)}
            >
              <Cloud aria-hidden />
              {tAttach('pickFromCloud')}
            </Button>
          ) : null}
        </div>
        <Button type="submit" size="sm" loading={busy} className={submitClassName}>
          {uploadLabel ?? submitLabel}
        </Button>
      </div>

      {displayError ? (
        <Alert tone="danger" role="alert">
          {displayError}
        </Alert>
      ) : null}
      {partialError ? (
        <Alert tone="warning" role="status">
          {partialError}
        </Alert>
      ) : null}

      {canBrowseCloudFiles && projectId ? (
        <ProjectCloudFilePicker
          projectId={projectId}
          open={cloudPickerOpen}
          onOpenChange={setCloudPickerOpen}
          browserActions={cloudFileBrowserActions}
          onSelect={(file) => {
            setPendingCloudFiles((current) => {
              const id = file.providerFileId;
              if (current.some((entry) => entry.id === id)) return current;
              return [...current, { ...file, id }];
            });
          }}
        />
      ) : null}
    </form>
  );
}

// ─── Comment Actions (Edit / Delete) ──────────────────────────────────────────

export function CommentActionsClient({
  commentId,
  taskId,
  currentBody,
  editAction,
  deleteAction,
  labelEdit,
  labelDelete,
  labelSave,
  labelCancel,
}: {
  commentId: string;
  taskId: string;
  currentBody: string;
  editAction: (prev: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  deleteAction: (prev: TaskActionState, formData: FormData) => Promise<TaskActionState>;
  labelEdit: string;
  labelDelete: string;
  labelSave: string;
  labelCancel: string;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [editState, editFormAction, editPending] = useActionState(
    editAction,
    {} as TaskActionState,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deleteAction,
    {} as TaskActionState,
  );

  if (mode === 'edit') {
    return (
      <form
        action={(fd) => {
          editFormAction(fd);
          setMode('view');
        }}
        className="w-full flex flex-col gap-2 mt-1"
      >
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="commentId" value={commentId} />
        <Textarea
          name="body"
          defaultValue={currentBody}
          rows={3}
          required
          maxLength={20_000}
          className="min-h-20"
          autoFocus
        />
        <div className="flex gap-2">
          <Button type="submit" size="sm" loading={editPending}>
            {labelSave}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setMode('view')}
          >
            {labelCancel}
          </Button>
        </div>
        {editState.error ? (
          <Alert tone="danger" role="alert">
            {editState.error}
          </Alert>
        ) : null}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        onClick={() => setMode('edit')}
        aria-label={labelEdit}
        title={labelEdit}
      >
        <Pencil aria-hidden />
      </Button>

      <form action={deleteFormAction}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="commentId" value={commentId} />
        <Button
          type="submit"
          variant="ghost"
          size="iconSm"
          loading={deletePending}
          aria-label={labelDelete}
          title={labelDelete}
          className="text-[var(--pf-action-danger)] hover:text-[var(--pf-action-danger)]"
        >
          <Trash2 aria-hidden />
        </Button>
      </form>

      {deleteState.error ? (
        <Alert tone="danger" role="alert" className="text-xs">
          {deleteState.error}
        </Alert>
      ) : null}
    </div>
  );
}

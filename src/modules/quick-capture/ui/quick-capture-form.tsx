'use client';

import { Camera, FileText, Film, ImagePlus, Video, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { openFilePicker } from '@/modules/documents/client/open-file-picker';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import {
  isAllowedFileSize,
  normalizeUploadMime,
} from '@/modules/documents/domain/file-rules';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import { Link, useRouter } from '@/shared/i18n/navigation';
import { MAX_CAPTURE_IMAGES, validateSessionFiles } from '../domain/capture-session-limits';
import { isVideoMimeType } from '../domain/video-mime';
import {
  finalizeQuickCaptureUploadAction,
  markQuickCaptureUploadFailedAction,
  submitQuickCaptureAction,
} from '../application/quick-capture-actions';
import { QuickCaptureGallery } from './quick-capture-gallery';
import { QuickCaptureProjectSelect } from './quick-capture-project-select';
import { QuickCaptureVideoRecorder } from './quick-capture-video-recorder';

type SessionMode = 'images' | 'video' | 'pdf' | 'file' | null;

function detectModeFromFiles(files: readonly File[]): SessionMode {
  if (files.length === 0) return null;
  const validation = validateSessionFiles(
    files.map((file) => ({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    })),
  );
  return validation.ok ? validation.sessionKind : null;
}

export function QuickCaptureForm({
  projects,
  canManageDocuments,
  storageConfigured,
}: {
  readonly projects: readonly { id: string; name: string }[];
  readonly canManageDocuments: boolean;
  readonly storageConfigured: boolean;
}) {
  const t = useTranslations('quickCapture');
  const tForm = useTranslations('quickCapture.form');
  const tErrors = useTranslations('quickCapture.errors');
  const tDocs = useTranslations('documents.errors');
  const tFileSize = useTranslations('documents.fileSize');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<SessionMode>(null);
  const [ownerNote, setOwnerNote] = useState('');
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const nativeVideoInputRef = useRef<HTMLInputElement>(null);

  const previewUrls = useMemo(
    () => files.filter((f) => f.type.startsWith('image/')).map((f) => URL.createObjectURL(f)),
    [files],
  );

  useEffect(
    () => () => {
      for (const url of previewUrls) URL.revokeObjectURL(url);
    },
    [previewUrls],
  );

  const showPicker = canManageDocuments && storageConfigured;
  const imageCount = files.filter((f) => f.type.startsWith('image/')).length;
  const canAddImage = mode === 'images' && imageCount < MAX_CAPTURE_IMAGES;

  const resetSession = useCallback(() => {
    setFiles([]);
    setMode(null);
    setError(null);
  }, []);

  const applyFiles = useCallback(
    (incoming: FileList | File[]) => {
      setError(null);
      setInfo(null);
      const next = [...files, ...Array.from(incoming)];
      const normalized: File[] = [];

      for (const file of next) {
        const mime = normalizeUploadMime(file.type, file.name);
        if (!mime.ok) {
          setError(tDocs('mimeNotAllowed'));
          continue;
        }
        if (!isAllowedFileSize(file.size)) {
          setError(
            isVideoMimeType(mime.mimeType) ? t('video.tooLarge') : tDocs('fileTooLarge'),
          );
          continue;
        }
        normalized.push(
          file.type === mime.mimeType
            ? file
            : new File([file], file.name, { type: mime.mimeType, lastModified: file.lastModified }),
        );
      }

      const validation = validateSessionFiles(
        normalized.map((file) => ({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        })),
      );
      if (!validation.ok) {
        setError(tErrors(validation.messageKey.replace('quickCapture.errors.', '') as 'emptySession'));
        return;
      }

      setMode(validation.sessionKind);
      setFiles(normalized);
    },
    [files, t, tDocs, tErrors],
  );

  const replaceSession = useCallback(
    (incoming: File) => {
      const mime = normalizeUploadMime(incoming.type, incoming.name);
      if (!mime.ok) {
        setError(tDocs('mimeNotAllowed'));
        return;
      }
      if (!isAllowedFileSize(incoming.size)) {
        setError(isVideoMimeType(mime.mimeType) ? t('video.tooLarge') : tDocs('fileTooLarge'));
        return;
      }
      const file =
        incoming.type === mime.mimeType
          ? incoming
          : new File([incoming], incoming.name, {
              type: mime.mimeType,
              lastModified: incoming.lastModified,
            });
      const validation = validateSessionFiles([
        { fileName: file.name, mimeType: file.type, sizeBytes: file.size },
      ]);
      if (!validation.ok) {
        setError(tErrors(validation.messageKey.replace('quickCapture.errors.', '') as 'emptySession'));
        return;
      }
      setMode(validation.sessionKind);
      setFiles([file]);
      setError(null);
    },
    [t, tDocs, tErrors],
  );

  const removeAt = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    setMode(detectModeFromFiles(next));
    setError(null);
  };

  const handleSave = () => {
    setError(null);
    setInfo(null);
    if (files.length === 0) {
      setError(tErrors('emptySession'));
      return;
    }

    startTransition(async () => {
      const sessionFiles = files.map((file) => ({
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }));

      const submitted = await submitQuickCaptureAction({
        files: sessionFiles,
        ownerNote: ownerNote.trim() || undefined,
        explicitProjectId: projectId || undefined,
        source: 'quick_capture',
      });

      if (!submitted.ok) {
        setError(submitted.error);
        return;
      }

      const { captureId, uploads } = submitted.data;
      const finalizedDocs: { documentId: string; sizeBytes: number }[] = [];

      for (const upload of uploads) {
        const file = files[upload.position];
        if (!file) continue;

        const uploaded = await uploadDocumentBytes(
          {
            uploadUrl: upload.uploadUrl,
            uploadMode: upload.uploadMode ?? 'external',
            uploadToken: upload.uploadToken,
            uploadPath: upload.uploadPath,
            uploadBucket: upload.uploadBucket,
          },
          file,
          { contentType: file.type },
        );

        if (!uploaded.ok) {
          await markQuickCaptureUploadFailedAction({
            captureId,
            errorCode: uploaded.messageKey ?? 'storage_upload',
            errorMessage: uploaded.message ?? 'Upload failed',
          });
          setError(t('video.uploadFailed'));
          return;
        }

        finalizedDocs.push({ documentId: upload.documentId, sizeBytes: file.size });
      }

      const finalized = await finalizeQuickCaptureUploadAction({
        captureId,
        documents: finalizedDocs,
      });

      if (!finalized.ok) {
        setError(finalized.error);
        return;
      }

      router.push(`/quick-capture/${captureId}`);
    });
  };

  const stagedDocuments = files.map((file, index) => ({
    documentId: `local-${index}`,
    position: index,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }));

  return (
    <div className="flex max-w-lg flex-col gap-4">
      {!canManageDocuments ? <Alert tone="info">{tForm('manageRequired')}</Alert> : null}
      {canManageDocuments && !storageConfigured ? (
        <Alert tone="info">
          {tForm('storageNotConfigured')}{' '}
          <Link href="/settings/storage" className="font-medium underline">
            {tForm('storageSettingsLink')}
          </Link>
        </Alert>
      ) : null}

      {info ? (
        <Alert tone="info" role="status">
          {info}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {showPicker ? (
        <div className="flex flex-col gap-2">
          <input
            ref={captureInputRef}
            type="file"
            className="sr-only"
            accept="image/*"
            capture="environment"
            disabled={pending || (mode !== null && mode !== 'images')}
            onChange={(event) => {
              if (event.target.files?.length) applyFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,image/*,.mp4,.mov,.webm,video/*,application/pdf"
            multiple
            disabled={pending}
            onChange={(event) => {
              if (event.target.files?.length) applyFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={nativeVideoInputRef}
            type="file"
            className="sr-only"
            accept="video/*"
            capture="environment"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) replaceSession(file);
              event.target.value = '';
            }}
          />

          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full justify-center"
            disabled={pending || (mode !== null && mode !== 'images') || imageCount >= MAX_CAPTURE_IMAGES}
            onClick={() => openFilePicker(captureInputRef.current)}
          >
            <Camera aria-hidden />
            {tForm('captureNow')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full justify-center"
            disabled={pending || (mode !== null && mode !== 'video') || recording}
            onClick={() => {
              setRecording(true);
              setInfo(null);
              setError(null);
            }}
          >
            <Video aria-hidden />
            {tForm('recordVideo')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 w-full justify-center"
            disabled={pending}
            onClick={() => openFilePicker(fileInputRef.current)}
          >
            <ImagePlus aria-hidden />
            {tForm('chooseFiles')}
          </Button>
        </div>
      ) : null}

      {recording ? (
        <QuickCaptureVideoRecorder
          disabled={pending}
          onRecorded={(file) => {
            setRecording(false);
            replaceSession(file);
          }}
          onFallback={() => {
            setRecording(false);
            setInfo(t('video.fallbackBrowser'));
            openFilePicker(nativeVideoInputRef.current);
          }}
          onCancel={() => setRecording(false)}
        />
      ) : null}

      {mode === 'images' && canAddImage && files.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => openFilePicker(captureInputRef.current)}
        >
          {tForm('addPhoto')}
        </Button>
      ) : null}

      {files.length > 0 ? (
        <div className="flex flex-col gap-3">
          {mode === 'images' ? (
            <QuickCaptureGallery
              documents={stagedDocuments}
              previewUrls={previewUrls}
              onRemoveAt={removeAt}
            />
          ) : null}

          {mode === 'video' && files[0] ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Film aria-hidden className="shrink-0" />
                <span dir="ltr" className="truncate text-sm" style={{ unicodeBidi: 'isolate' }}>
                  {files[0].name}
                </span>
                <span className="text-xs text-[var(--pf-text-muted)]">
                  {formatFileSize(files[0].size, tFileSize)}
                </span>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={resetSession}>
                <X aria-hidden />
              </Button>
            </div>
          ) : null}

          {(mode === 'pdf' || mode === 'file') && files[0] ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText aria-hidden className="shrink-0" />
                <span dir="ltr" className="truncate text-sm" style={{ unicodeBidi: 'isolate' }}>
                  {files[0].name}
                </span>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={resetSession}>
                <X aria-hidden />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Field label={tForm('note')}>
        {(control) => (
          <Textarea
            id={control.id}
            value={ownerNote}
            onChange={(event) => setOwnerNote(event.target.value)}
            rows={3}
            disabled={pending}
          />
        )}
      </Field>

      <QuickCaptureProjectSelect
        projects={projects}
        value={projectId}
        onValueChange={setProjectId}
        disabled={pending}
      />

      <Button
        type="button"
        variant="primary"
        className="min-h-11 w-full"
        disabled={pending || !showPicker || files.length === 0}
        onClick={handleSave}
      >
        {pending ? <Spinner className="me-2" /> : null}
        {tForm('save')}
      </Button>
    </div>
  );
}

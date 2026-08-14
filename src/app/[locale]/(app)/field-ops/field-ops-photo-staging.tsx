'use client';

import { Camera, ImagePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CREATE_PHOTO_FIELD, MAX_CREATE_PHOTOS } from '@/modules/documents/domain/create-form-files';
import {
  isAllowedFileSize,
  normalizeUploadMime,
} from '@/modules/documents/domain/file-rules';
import { openFilePicker } from '@/modules/documents/client/open-file-picker';
import type { DraftKind } from '@/modules/offline/domain/types';
import {
  useOfflineAwareFormAction,
  type OfflineDraftFormState,
} from '@/modules/offline/ui/use-offline-aware-form-action';

export function useStagedCreatePhotos() {
  const [files, setFiles] = useState<File[]>([]);

  const appendToFormData = useCallback(
    (formData: FormData) => {
      for (const file of files) {
        formData.append(CREATE_PHOTO_FIELD, file);
      }
    },
    [files],
  );

  return { files, setFiles, appendToFormData };
}

export function useFieldOpsCreateFormAction<S extends OfflineDraftFormState>(options: {
  readonly kind: Exclude<DraftKind, 'capture'>;
  readonly onlineAction: (prev: S, formData: FormData) => Promise<S>;
  readonly buildPayload: (formData: FormData) => Record<string, unknown>;
  readonly offlineSuccessState: S;
  readonly missingOrgError: string;
  readonly appendPhotos: (formData: FormData) => void;
}): (prev: S, formData: FormData) => Promise<S> {
  const offlineAction = useOfflineAwareFormAction<S>({
    kind: options.kind,
    onlineAction: options.onlineAction,
    buildPayload: options.buildPayload,
    offlineSuccessState: options.offlineSuccessState,
    missingOrgError: options.missingOrgError,
  });

  const appendPhotos = options.appendPhotos;

  return useCallback(
    async (prev: S, formData: FormData) => {
      appendPhotos(formData);
      return offlineAction(prev, formData);
    },
    [appendPhotos, offlineAction],
  );
}

export interface FieldOpsPhotoStagingProps {
  files: readonly File[];
  onFilesChange: (files: File[]) => void;
  canManageDocuments: boolean;
  storageConfigured: boolean;
  disabled?: boolean;
}

/**
 * Stage photos on a field-ops create form. Bytes upload after the record exists,
 * in the same Save (prepare → private signed PUT → finalize).
 */
export function FieldOpsPhotoStaging({
  files,
  onFilesChange,
  canManageDocuments,
  storageConfigured,
  disabled = false,
}: FieldOpsPhotoStagingProps) {
  const t = useTranslations('fieldOps.photoCapture');
  const tErrors = useTranslations('documents.errors');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const showPicker = canManageDocuments && storageConfigured;
  const remaining = Math.max(0, MAX_CREATE_PHOTOS - files.length);

  const addFiles = (incoming: FileList | File[]) => {
    setError(null);
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_CREATE_PHOTOS) break;
      const mime = normalizeUploadMime(file.type, file.name);
      if (!mime.ok) {
        setError(tErrors('mimeNotAllowed'));
        continue;
      }
      if (!isAllowedFileSize(file.size)) {
        setError(tErrors('fileTooLarge'));
        continue;
      }
      next.push(file);
    }
    onFilesChange(next);
  };

  const removeAt = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium text-[var(--pf-text-primary)]">{t('title')}</p>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('body')}</p>
      </div>

      {!canManageDocuments ? <Alert tone="info">{t('manageRequired')}</Alert> : null}
      {canManageDocuments && !storageConfigured ? (
        <Alert tone="info">{t('storageNotConfigured')}</Alert>
      ) : null}

      {showPicker ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,image/*"
            multiple
            disabled={disabled || remaining === 0}
            onChange={(event) => {
              if (event.target.files?.length) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <input
            ref={captureInputRef}
            type="file"
            className="sr-only"
            accept="image/*"
            capture="environment"
            disabled={disabled || remaining === 0}
            onChange={(event) => {
              if (event.target.files?.length) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || remaining === 0}
            onClick={() => openFilePicker(fileInputRef.current)}
          >
            <ImagePlus aria-hidden />
            {t('add')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || remaining === 0}
            onClick={() => openFilePicker(captureInputRef.current)}
          >
            <Camera aria-hidden />
            {t('capture')}
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}

      {files.length > 0 ? (
        <>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('staged', { count: files.length })}</p>
          <ul className="flex flex-col gap-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
              >
                <span dir="ltr" className="truncate text-sm" style={{ unicodeBidi: 'isolate' }}>
                  {file.name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label={t('remove')}
                >
                  <X aria-hidden />
                  {t('remove')}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import { ProjectCoverImage } from './project-cover-image';
import {
  confirmProjectCoverUploadAction,
  prepareProjectCoverUploadAction,
  removeProjectCoverAction,
} from '@/app/[locale]/(app)/projects/[projectId]/project-cover-actions';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export interface ProjectCoverImageControlProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly previewUrl: string | null;
  readonly canEdit: boolean;
  readonly schemaReady: boolean;
  readonly storageConfigured: boolean;
}

export function ProjectCoverImageControl({
  projectId,
  projectName,
  previewUrl,
  canEdit,
  schemaReady,
  storageConfigured,
}: ProjectCoverImageControlProps) {
  const t = useTranslations('projects.cover');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUpload, startUpload] = useTransition();
  const [removePending, startRemove] = useTransition();

  const uploadDisabled = !canEdit || !schemaReady || !storageConfigured;
  const disabledReason = !schemaReady
    ? t('schemaPending')
    : !storageConfigured
      ? t('storageNotConfigured')
      : null;

  function onPick() {
    if (uploadDisabled) return;
    inputRef.current?.click();
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploadDisabled) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setError(t('invalidType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('tooLarge'));
      return;
    }

    setError(null);
    startUpload(async () => {
      const prepared = await prepareProjectCoverUploadAction({
        projectId,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!prepared.ok || !prepared.uploadUrl || !prepared.storageKey) {
        setError(prepared.error ?? t('uploadFailed'));
        return;
      }

      const uploaded = await uploadDocumentBytes(
        {
          uploadUrl: prepared.uploadUrl,
          uploadToken: prepared.uploadToken,
          uploadPath: prepared.uploadPath,
        },
        file,
        { contentType: file.type },
      );
      if (!uploaded.ok) {
        setError(t('uploadFailed'));
        return;
      }

      const confirmed = await confirmProjectCoverUploadAction({
        projectId,
        storageKey: prepared.storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (confirmed.error) {
        setError(confirmed.error);
        return;
      }
      router.refresh();
    });
  }

  function onRemove() {
    if (!canEdit || !schemaReady || !previewUrl) return;
    setError(null);
    startRemove(async () => {
      const result = await removeProjectCoverAction({ projectId });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{t('title')}</p>
        {disabledReason && canEdit ? (
          <p className="text-xs text-[var(--pf-text-secondary)]">{disabledReason}</p>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <ProjectCoverImage projectName={projectName} imageUrl={previewUrl} />

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploadDisabled}
            onChange={onFileChange}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={pendingUpload}
            disabled={uploadDisabled}
            onClick={onPick}
          >
            {previewUrl ? t('replace') : t('upload')}
          </Button>
          {previewUrl && schemaReady ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              loading={removePending}
              disabled={!schemaReady}
              onClick={onRemove}
            >
              {t('remove')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

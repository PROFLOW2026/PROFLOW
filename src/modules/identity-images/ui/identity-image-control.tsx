'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import { cn } from '@/shared/ui/cn';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export interface IdentityImageActionResult {
  readonly ok?: boolean;
  readonly error?: string;
  readonly uploadUrl?: string | null;
  readonly uploadToken?: string | null;
  readonly uploadPath?: string | null;
  readonly storageKey?: string | null;
  readonly previewUrl?: string | null;
}

export interface IdentityImageCopy {
  readonly label: string;
  readonly hint?: string;
  readonly upload: string;
  readonly replace: string;
  readonly remove: string;
  readonly invalidType: string;
  readonly tooLarge: string;
  readonly uploadFailed: string;
  readonly schemaPending: string;
  readonly storageNotConfigured: string;
}

export interface IdentityImageControlProps {
  readonly copy: IdentityImageCopy;
  readonly previewUrl: string | null;
  readonly displayName: string;
  readonly canEdit: boolean;
  readonly schemaReady: boolean;
  readonly storageConfigured: boolean;
  readonly prepareAction: (input: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<IdentityImageActionResult>;
  readonly confirmAction: (input: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<IdentityImageActionResult>;
  readonly removeAction: () => Promise<IdentityImageActionResult>;
  readonly className?: string;
}

export function IdentityImageControl({
  copy,
  previewUrl,
  displayName,
  canEdit,
  schemaReady,
  storageConfigured,
  prepareAction,
  confirmAction,
  removeAction,
  className,
}: IdentityImageControlProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [pendingUpload, startUpload] = useTransition();
  const [removePending, startRemove] = useTransition();

  const shownUrl = localPreview ?? previewUrl;
  const uploadDisabled = !canEdit || !schemaReady || !storageConfigured;
  const disabledReason = !schemaReady
    ? copy.schemaPending
    : !storageConfigured
      ? copy.storageNotConfigured
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
      setError(copy.invalidType);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(copy.tooLarge);
      return;
    }

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);

    startUpload(async () => {
      try {
        const prepared = await prepareAction({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (prepared.error || !prepared.uploadUrl || !prepared.storageKey) {
          setError(prepared.error ?? copy.uploadFailed);
          setLocalPreview(null);
          return;
        }

        const uploaded = await uploadDocumentBytes(
          {
            uploadUrl: prepared.uploadUrl,
            uploadToken: prepared.uploadToken ?? null,
            uploadPath: prepared.uploadPath ?? prepared.storageKey,
          },
          file,
          { contentType: file.type },
        );
        if (!uploaded.ok) {
          setError(copy.uploadFailed);
          setLocalPreview(null);
          return;
        }

        const confirmed = await confirmAction({
          storageKey: prepared.storageKey,
          mimeType: file.type,
          sizeBytes: file.size,
        });
        if (confirmed.error) {
          setError(confirmed.error);
          setLocalPreview(null);
          return;
        }
        if (confirmed.previewUrl) setLocalPreview(confirmed.previewUrl);
        router.refresh();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    });
  }

  function onRemove() {
    if (!canEdit || !schemaReady || !shownUrl) return;
    setError(null);
    startRemove(async () => {
      const result = await removeAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setLocalPreview(null);
      router.refresh();
    });
  }

  const initial = displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}>
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[var(--pf-border-default)] bg-[var(--pf-teal-100)] text-2xl font-semibold text-[var(--pf-teal-800)]">
        {shownUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, short-lived
          <img src={shownUrl} alt="" className="size-full object-cover" />
        ) : (
          <span aria-hidden>{initial}</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="text-sm font-semibold text-[var(--pf-text-primary)]">{copy.label}</p>
          {copy.hint ? <p className="text-xs text-[var(--pf-text-secondary)]">{copy.hint}</p> : null}
          {disabledReason ? (
            <p className="mt-1 text-xs text-[var(--pf-status-warning-fg)]">{disabledReason}</p>
          ) : null}
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={uploadDisabled || pendingUpload} onClick={onPick}>
              {shownUrl ? copy.replace : copy.upload}
            </Button>
            {shownUrl ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={uploadDisabled || removePending}
                onClick={onRemove}
              >
                {copy.remove}
              </Button>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onFileChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

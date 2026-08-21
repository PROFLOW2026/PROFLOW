'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { uploadDocumentBytes } from '@/modules/documents/client/upload-document-bytes';
import type { BrandAssetKind } from './_lib/types';
import {
  confirmBrandAssetUploadAction,
  prepareBrandAssetUploadAction,
  removeBrandAssetAction,
} from './actions';
import type { SettingsActionState } from '../actions';

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export function BrandAssetField({
  brandProfileId,
  assetKind,
  label,
  description,
  previewUrl,
  canEdit,
}: {
  brandProfileId: string;
  assetKind: BrandAssetKind;
  label: string;
  description?: string;
  previewUrl: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('settings.branding');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingUpload, startUpload] = useTransition();
  const [removeState, removeAction, removePending] = useActionState(
    removeBrandAssetAction,
    {} as SettingsActionState,
  );

  function onPick() {
    inputRef.current?.click();
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setError(t('assets.invalidType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t('assets.tooLarge'));
      return;
    }

    setError(null);
    startUpload(async () => {
      const prepared = await prepareBrandAssetUploadAction({
        brandProfileId,
        assetKind,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
      if (!prepared.ok || !prepared.uploadUrl || !prepared.storageKey) {
        setError(prepared.error ?? t('assets.uploadFailed'));
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
        setError(t('assets.uploadFailed'));
        return;
      }

      const confirmed = await confirmBrandAssetUploadAction({
        brandProfileId,
        assetKind,
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

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3 sm:p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <p className="text-xs text-[var(--pf-text-secondary)]">{description}</p>
        ) : null}
      </div>

      {error || removeState.error ? (
        <Alert tone="danger">{error ?? removeState.error}</Alert>
      ) : null}
      {removeState.ok ? <Alert tone="success">{t('assets.removed')}</Alert> : null}

      <div className="flex flex-wrap items-center gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URL
          <img
            src={previewUrl}
            alt=""
            className="h-14 max-w-36 rounded border border-[var(--pf-border-default)] bg-[var(--pf-neutral-50)] object-contain p-1"
          />
        ) : (
          <div className="flex h-14 w-28 items-center justify-center rounded border border-dashed border-[var(--pf-border-default)] text-xs text-[var(--pf-text-muted)]">
            {t('assets.noImage')}
          </div>
        )}

        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={onFileChange}
            />
            <Button type="button" variant="secondary" size="sm" loading={pendingUpload} onClick={onPick}>
              {previewUrl ? t('assets.replace') : t('assets.upload')}
            </Button>
            {previewUrl ? (
              <form action={removeAction}>
                <input type="hidden" name="brandProfileId" value={brandProfileId} />
                <input type="hidden" name="assetKind" value={assetKind} />
                <Button type="submit" variant="ghost" size="sm" loading={removePending}>
                  {tCommon('actions.remove')}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

'use client';

import { Camera, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { evidenceAcceptAttribute } from '@/modules/evidence/domain/file-policy';
import {
  beginExternalEvidenceUploadAction,
  beginInternalEvidenceUploadAction,
} from '@/modules/evidence/actions';
import type { EvidenceUploaderProps } from './types';

export function EvidenceUploader(props: EvidenceUploaderProps) {
  const t = useTranslations('projectPlans.evidence.uploader');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'internal' | 'contractor'>(props.defaultVisibility ?? 'contractor');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const accept = props.accept ?? ['photo', 'video', 'document'];
  const acceptAttr = evidenceAcceptAttribute(accept);

  const uploadFile = (file: File | null) => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const base = {
        entityType: props.entityType,
        entityId: props.entityId,
        projectId: props.projectId,
        fileName: file.name,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        caption: caption || undefined,
        locationId: props.locationId ?? undefined,
        accept: [...accept],
      };
      const begun =
        props.viewer === 'internal'
          ? await beginInternalEvidenceUploadAction({
              ...base,
              visibility,
            })
          : await beginExternalEvidenceUploadAction({
              ...base,
              organizationId: props.organizationId,
            });
      if (!begun.ok) {
        setError(begun.error);
        return;
      }
      const response = await fetch(begun.uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!response.ok) {
        setError(t('uploadFailed'));
        return;
      }
      setCaption('');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {props.viewer === 'internal' ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('visibility')}</span>
          <select
            className="min-h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-default)] px-3"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as 'internal' | 'contractor')}
            disabled={pending}
          >
            <option value="contractor">{t('visibilityContractor')}</option>
            <option value="internal">{t('visibilityInternal')}</option>
          </select>
        </label>
      ) : null}
      <Input
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        placeholder={t('captionPlaceholder')}
        disabled={pending}
      />
      <input ref={fileRef} type="file" className="sr-only" accept={acceptAttr} onChange={(event) => uploadFile(event.target.files?.[0] ?? null)} />
      <input
        ref={captureRef}
        type="file"
        className="sr-only"
        accept="image/*,video/*"
        capture="environment"
        onChange={(event) => uploadFile(event.target.files?.[0] ?? null)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          {t('chooseFile')}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => captureRef.current?.click()}>
          <Camera className="size-4" aria-hidden />
          {t('capture')}
        </Button>
      </div>
      {error ? <p className="text-sm text-[var(--pf-text-danger)]">{error}</p> : null}
    </div>
  );
}

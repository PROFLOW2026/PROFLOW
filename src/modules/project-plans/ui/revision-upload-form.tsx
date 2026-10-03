'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { beginDrawingRevisionUploadAction, publishDrawingRevisionAction } from '@/modules/project-plans/actions/internal-actions';

export function RevisionUploadForm({
  projectId,
  drawingId,
  suggestedLabel,
}: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly suggestedLabel: string;
}) {
  const t = useTranslations('projectPlans.revision');
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState(suggestedLabel);
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = (file: File | null) => {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const begun = await beginDrawingRevisionUploadAction({
        projectId,
        drawingId,
        revisionLabel: label,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        sizeBytes: file.size,
      });
      if (!begun.ok) {
        setError(begun.error);
        return;
      }
      const response = await fetch(begun.data.uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!response.ok) {
        setError(t('uploadFailed'));
        return;
      }
      setRevisionId(begun.data.revisionId);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--pf-border-default)] p-4">
      <h3 className="text-sm font-semibold">{t('uploadTitle')}</h3>
      <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('label')} disabled={pending || Boolean(revisionId)} />
      <input ref={fileRef} type="file" className="sr-only" accept=".pdf,image/*" onChange={(e) => upload(e.target.files?.[0] ?? null)} />
      <Button type="button" variant="secondary" size="sm" disabled={pending || Boolean(revisionId)} onClick={() => fileRef.current?.click()}>
        {t('choosePdf')}
      </Button>
      {revisionId ? (
        <Button
          type="button"
          size="sm"
          loading={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await publishDrawingRevisionAction({ projectId, drawingId, revisionId });
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        >
          {t('publish')}
        </Button>
      ) : null}
      {error ? <p className="text-sm text-[var(--pf-text-danger)]">{error}</p> : null}
    </div>
  );
}

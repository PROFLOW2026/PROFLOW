'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { Button } from '@/components/ui/button';
import { DRAWING_CONTRACTOR_VISIBILITIES, type DrawingContractorVisibility } from '@/modules/project-plans/domain/types';
import { updateDrawingAction } from '@/modules/project-plans/actions/internal-actions';

export function DrawingVisibilityForm({
  projectId,
  drawingId,
  value,
}: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly value: DrawingContractorVisibility;
}) {
  const t = useTranslations('projectPlans');
  const router = useRouter();
  const [visibility, setVisibility] = useState<DrawingContractorVisibility>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updateDrawingAction({
            projectId,
            drawingId,
            contractorVisibility: visibility,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
        <span>{t('create.visibilityLabel')}</span>
        <select
          className="min-h-11 rounded-md border border-[var(--pf-border-default)] px-3"
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as DrawingContractorVisibility)}
          disabled={pending}
        >
          {DRAWING_CONTRACTOR_VISIBILITIES.map((option) => (
            <option key={option} value={option}>
              {t(`create.visibility.${option}`)}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="secondary" loading={pending} disabled={visibility === value}>
        {t('create.saveVisibility')}
      </Button>
      {error ? <p className="basis-full text-sm text-[var(--pf-text-danger)]">{error}</p> : null}
    </form>
  );
}

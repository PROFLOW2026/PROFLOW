'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DRAWING_DISCIPLINES } from '@/modules/project-plans/domain/types';
import { createDrawingAction } from '@/modules/project-plans/actions/internal-actions';

export function DrawingCreateForm({
  projectId,
  basePath,
}: {
  readonly projectId: string;
  /** Register route used after create. Defaults to the Owner app path. */
  readonly basePath?: string;
}) {
  const t = useTranslations('projectPlans.create');
  const router = useRouter();
  const [drawingNumber, setDrawingNumber] = useState('');
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState<string>(DRAWING_DISCIPLINES[0]!);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-[var(--pf-border-default)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createDrawingAction({ projectId, drawingNumber, title, discipline });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`${basePath ?? `/projects/${projectId}/plans`}/${result.data.drawingId}`);
          router.refresh();
        });
      }}
    >
      <h2 className="text-base font-semibold">{t('title')}</h2>
      <Input value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} placeholder={t('number')} required disabled={pending} />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titleField')} required disabled={pending} />
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('disciplineLabel')}</span>
        <select
          className="min-h-11 rounded-md border border-[var(--pf-border-default)] px-3"
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value)}
          disabled={pending}
        >
          {DRAWING_DISCIPLINES.map((value) => (
            <option key={value} value={value}>
              {t(`discipline.${value}` as never)}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm text-[var(--pf-text-danger)]">{error}</p> : null}
      <Button type="submit" loading={pending}>
        {t('submit')}
      </Button>
    </form>
  );
}

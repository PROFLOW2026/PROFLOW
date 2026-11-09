'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type { DrawingPickerOption } from '../domain/drawing-picker';

export function drawingRevisionPickerClassName() {
  return 'mt-1 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-primary)] px-3 py-2 text-sm';
}

export function DrawingRevisionPickerFields({
  drawings,
  fieldErrors,
  translationNamespace,
}: {
  drawings: readonly DrawingPickerOption[];
  fieldErrors?: Record<string, string>;
  /** `rfi` or `submittals` — field labels live in each namespace. */
  translationNamespace: 'rfi' | 'submittals';
}) {
  const t = useTranslations(translationNamespace);
  const [drawingId, setDrawingId] = useState('');
  const selectedDrawing = useMemo(
    () => drawings.find((drawing) => drawing.drawingId === drawingId) ?? null,
    [drawings, drawingId],
  );
  const revisions = selectedDrawing?.revisions ?? [];
  const [revisionId, setRevisionId] = useState('');

  function chooseDrawing(nextId: string) {
    setDrawingId(nextId);
    const drawing = drawings.find((item) => item.drawingId === nextId);
    const nextRevisions = drawing?.revisions ?? [];
    const current = nextRevisions.find((revision) => revision.status === 'current');
    setRevisionId(current?.id ?? nextRevisions[0]?.id ?? '');
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="drawingId" value={drawingId} />
      <input type="hidden" name="drawingRevisionId" value={drawingId ? revisionId : ''} />
      <select
        name="drawingId_ui"
        className={drawingRevisionPickerClassName()}
        value={drawingId}
        onChange={(event) => chooseDrawing(event.target.value)}
        aria-invalid={fieldErrors?.drawingId ? true : undefined}
      >
        <option value="">{t('fields.noProjectDrawing')}</option>
        {drawings.map((drawing) => (
          <option key={drawing.drawingId} value={drawing.drawingId}>
            {drawing.drawingNumber} · {drawing.title}
          </option>
        ))}
      </select>
      {fieldErrors?.drawingId ? (
        <span role="alert" className="text-xs text-[var(--pf-action-danger)]">
          {fieldErrors.drawingId}
        </span>
      ) : null}
      {drawingId ? (
        <select
          name="drawingRevisionId_ui"
          className={drawingRevisionPickerClassName()}
          value={revisionId}
          onChange={(event) => setRevisionId(event.target.value)}
          aria-invalid={fieldErrors?.drawingRevisionId ? true : undefined}
        >
          {revisions.length === 0 ? (
            <option value="">{t('fields.noDrawingRevision')}</option>
          ) : (
            revisions.map((revision) => (
              <option key={revision.id} value={revision.id}>
                {revision.label}
                {revision.status === 'current' ? ` (${t('fields.currentRevision')})` : ''}
              </option>
            ))
          )}
        </select>
      ) : null}
      {fieldErrors?.drawingRevisionId ? (
        <span role="alert" className="text-xs text-[var(--pf-action-danger)]">
          {fieldErrors.drawingRevisionId}
        </span>
      ) : null}
    </div>
  );
}

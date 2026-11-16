'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CatalogType, EffectiveDetection, SheetDto } from '../domain/contracts';
import { detectionDisplayLabel } from './boq-display';
import type { ReviewGroup, TypeSuggestion } from './review-guide';
import { symbolCropSource, symbolIdentityLabel } from './review-guide';
import { canSaveReclassifyToLibrary } from './takeoff-analysis-view';
import { TakeoffTypePicker } from './takeoff-type-picker';

export function TakeoffReviewGuide({
  group,
  focus,
  occurrences,
  sheet,
  catalog,
  suggestions,
  separateOccurrences,
  readOnly,
  saving,
  progress,
  shownId,
  onShowOccurrence,
  onConfirm,
  vectorPlan = false,
}: {
  group: ReviewGroup;
  focus: EffectiveDetection;
  occurrences: readonly EffectiveDetection[];
  sheet: SheetDto | null;
  catalog: readonly CatalogType[];
  suggestions: readonly TypeSuggestion[];
  separateOccurrences: number;
  readOnly: boolean;
  saving: boolean;
  progress: { checked: number; total: number };
  shownId: string;
  onShowOccurrence: (detectionId: string) => void;
  onConfirm: (choice: { typeKey: string; saveToLibrary: boolean; detectionIds: string[] }) => Promise<boolean>;
  /** The plan pane is the vector drawing, so the review card does not crop the raster. */
  vectorPlan?: boolean;
}) {
  const t = useTranslations('takeoff');
  const marks = occurrences.length > 0 ? occurrences : [focus];
  const index = Math.max(0, marks.findIndex((item) => item.id === shownId));
  const current = marks[index] ?? focus;
  const [form, setForm] = useState({
    key: group.key,
    pick: group.typeKey ?? '',
    scope: 'one' as 'one' | 'group',
    saveLib: false,
  });
  if (form.key !== group.key) {
    setForm({ key: group.key, pick: group.typeKey ?? '', scope: 'one', saveLib: false });
  }
  const [symbolState, setSymbolState] = useState({ id: current.id, ready: Boolean(sheet?.previewUrl) });
  if (symbolState.id !== current.id) {
    setSymbolState({ id: current.id, ready: Boolean(sheet?.previewUrl) });
  }
  const pick = form.pick;
  const scope = form.scope;
  const saveLib = form.saveLib;
  const symbolReady = vectorPlan || symbolState.ready;
  const setPick = (value: string) => setForm((currentForm) => ({ ...currentForm, pick: value }));
  const setScope = (value: 'one' | 'group') => setForm((currentForm) => ({ ...currentForm, scope: value }));
  const setSaveLib = (value: boolean) => setForm((currentForm) => ({ ...currentForm, saveLib: value }));
  const identity = symbolIdentityLabel(current);
  const showTypeChoice = symbolReady;
  const libraryAllowed = canSaveReclassifyToLibrary(current, pick || null);
  const needsType = !pick;
  const scopeCount = scope === 'group' ? group.occurrences : 1;

  return (
    <section
      data-testid="takeoff-review-guide"
      data-focus-id={current.id}
      data-group-ids={group.detectionIds.join(',')}
      className="min-w-0 max-w-full shrink-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2"
    >
      <p className="text-xs font-medium text-[var(--pf-text-primary)]" data-testid="takeoff-guide-progress">
        {t('guide.progress', progress)}
      </p>
      <div className="mt-2 space-y-2">
        {vectorPlan ? (
          <p className="text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-guide-symbol" data-symbol-state="ready">
            {t('guide.symbolCaption')}
          </p>
        ) : (
          <SymbolCrop
            key={current.id}
            detection={current}
            sheet={sheet}
            onAvailability={(ready) => setSymbolState({ id: current.id, ready })}
          />
        )}
        {marks.length > 1 ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11 min-w-11"
              data-testid="takeoff-guide-prev-occurrence"
              disabled={index <= 0}
              onClick={() => {
                const mark = marks[Math.max(0, index - 1)];
                if (mark) onShowOccurrence(mark.id);
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
            <p className="min-w-0 flex-1 text-center text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-guide-occurrence">
              {t('guide.occurrence', { current: index + 1, total: marks.length })}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11 min-w-11"
              data-testid="takeoff-guide-next-occurrence"
              disabled={index >= marks.length - 1}
              onClick={() => {
                const mark = marks[Math.min(marks.length - 1, index + 1)];
                if (mark) onShowOccurrence(mark.id);
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        ) : null}
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-semibold text-[var(--pf-text-primary)] lg:truncate">
            {detectionDisplayLabel(current, catalog, t('detection.unclassified'))}
          </p>
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('guide.occurrences', { count: group.occurrences })}</p>
          {identity ? (
            <p className="break-words text-xs text-[var(--pf-text-secondary)] lg:truncate">
              {identity.kind === 'block'
                ? t('guide.blockName', { name: identity.value })
                : t('guide.legendKey', { name: identity.value })}
            </p>
          ) : null}
          <p className="text-xs font-medium text-[var(--pf-status-warning-fg)]" data-testid="takeoff-guide-reason">
            {t(`guide.reason.${group.kind}`)}
          </p>
          {group.reasons.length > 0 ? (
            <p className="text-[11px] text-[var(--pf-text-muted)]">
              {group.reasons.map((reason) => t(`reviewReason.${reason}` as 'reviewReason.unclassified')).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>

      {showTypeChoice && suggestions.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {suggestions.map((suggestion) => {
            const name = catalog.find((type) => type.key === suggestion.typeKey)?.nameHe ?? suggestion.typeKey;
            return (
              <li key={`${suggestion.source}:${suggestion.typeKey}`}>
                <button
                  type="button"
                  className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-2 text-start text-xs hover:bg-[var(--pf-action-subtle-hover)]"
                  disabled={readOnly}
                  onClick={() => setPick(suggestion.typeKey)}
                >
                  {suggestion.source === 'library'
                    ? t('guide.suggestLibrary', { name })
                    : t('guide.suggestSame', { name })}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showTypeChoice ? (
      <div className="mt-2">
        <TakeoffTypePicker
          catalog={catalog}
          value={pick}
          disabled={readOnly || saving}
          testId="takeoff-guide-type"
          onChange={setPick}
        />
      </div>
      ) : null}

      {group.occurrences > 1 ? (
        <fieldset className="mt-2 space-y-1" disabled={readOnly || saving}>
          <legend className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('guide.scopeTitle')}</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name={`takeoff-guide-scope-${group.key}`}
              data-testid="takeoff-guide-scope-one"
              checked={scope === 'one'}
              onChange={() => setScope('one')}
            />
            {t('guide.scopeOne')}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name={`takeoff-guide-scope-${group.key}`}
              data-testid="takeoff-guide-scope-group"
              checked={scope === 'group'}
              onChange={() => setScope('group')}
            />
            {t('guide.scopeGroup', { count: group.occurrences })}
          </label>
          <p className="text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-guide-scope-note">
            {scope === 'one' ? t('guide.appliesOne') : t('guide.appliesGroup', { count: group.occurrences })}
          </p>
          {separateOccurrences > 0 ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('guide.othersSeparate', { count: separateOccurrences })}</p>
          ) : null}
        </fieldset>
      ) : (
        <p className="mt-2 text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-guide-scope-note">
          {t('guide.appliesOne')}
        </p>
      )}

      <label className="mt-1 flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="takeoff-guide-save-library"
          checked={saveLib && libraryAllowed}
          disabled={readOnly || saving || !libraryAllowed}
          onChange={(event) => setSaveLib(event.target.checked)}
        />
        {t('detection.saveToLibrary')}
      </label>

      {needsType ? <p className="text-xs text-[var(--pf-status-warning-fg)]">{t('guide.pickRequired')}</p> : null}

      <Button
        type="button"
        data-testid="takeoff-guide-confirm"
        className="mt-2 min-h-11 w-full"
        disabled={readOnly || saving || needsType || !showTypeChoice}
        aria-busy={saving}
        onClick={() => {
          const ids = scope === 'group' ? group.detectionIds : [current.id];
          void onConfirm({
            typeKey: pick,
            saveToLibrary: saveLib && libraryAllowed,
            detectionIds: ids,
          });
        }}
      >
        <Check className="size-4" />
        {saving ? t('guide.saving') : t('guide.confirmNext', { count: scopeCount })}
      </Button>
    </section>
  );
}

function SymbolCrop({
  detection,
  sheet,
  onAvailability,
}: {
  detection: EffectiveDetection;
  sheet: SheetDto | null;
  onAvailability: (ready: boolean) => void;
}) {
  const t = useTranslations('takeoff');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const crop =
    sheet && detection.w > 0 && detection.h > 0
      ? symbolCropSource(detection, sheet, { width: sheet.widthPx, height: sheet.heightPx })
      : null;

  useEffect(() => {
    if (!sheet?.previewUrl || detection.w <= 0 || detection.h <= 0) return;
    const canvas = canvasRef.current;
    const image = new Image();
    let cancelled = false;
    image.onload = () => {
      if (cancelled) return;
      const context = canvas?.getContext('2d');
      if (!canvas || !context || image.naturalWidth < 1) {
        setFailed(true);
        onAvailability(false);
        return;
      }
      const source = symbolCropSource(detection, sheet, {
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      const frame = 320;
      canvas.width = frame;
      canvas.height = frame;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, frame, frame);
      try {
        context.drawImage(image, source.sx, source.sy, source.sw, source.sh, 0, 0, frame, frame);
      } catch {
        setFailed(true);
        onAvailability(false);
        return;
      }
      try {
        const pixels = context.getImageData(0, 0, frame, frame).data;
        let ink = 0;
        let samples = 0;
        for (let index = 0; index < pixels.length; index += 16) {
          samples += 1;
          const luminance = pixels[index]! * 0.3 + pixels[index + 1]! * 0.59 + pixels[index + 2]! * 0.11;
          if (luminance < 220) ink += 1;
        }
        if (samples > 0 && ink === 0) {
          setFailed(true);
          onAvailability(false);
          return;
        }
      } catch {
        // A same-origin preview can still be unreadable in some browsers. Keep the crop.
      }
      const scale = frame / source.sw;
      const scaleY = frame / source.sh;
      const boxW = detection.w * (image.naturalWidth / sheet.widthPx) * scale;
      const boxH = detection.h * (image.naturalHeight / sheet.heightPx) * scaleY;
      const centerX = (detection.x * (image.naturalWidth / sheet.widthPx) - source.sx) * scale;
      const centerY = (detection.y * (image.naturalHeight / sheet.heightPx) - source.sy) * scaleY;
      context.strokeStyle = '#ea580c';
      context.lineWidth = 2;
      context.strokeRect(centerX - boxW / 2, centerY - boxH / 2, boxW, boxH);
      setFailed(false);
      onAvailability(true);
    };
    image.onerror = () => {
      if (cancelled) return;
      setFailed(true);
      onAvailability(false);
    };
    image.src = sheet.previewUrl;
    return () => {
      cancelled = true;
    };
  }, [detection, onAvailability, sheet]);

  if (!sheet?.previewUrl || !crop || failed) {
    return (
      <p
        className="rounded-md border border-[var(--pf-status-warning-fg)] bg-[var(--pf-status-warning-bg)] p-3 text-sm text-[var(--pf-status-warning-fg)]"
        data-testid="takeoff-guide-symbol"
        data-symbol-state="unavailable"
        role="status"
      >
        {t('guide.symbolUnavailable')}
      </p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="aspect-square h-auto w-full max-w-full rounded-md border border-[var(--pf-border-default)] bg-white"
      data-testid="takeoff-guide-symbol"
      data-symbol-state="ready"
      data-crop-sx={crop.sx}
      data-crop-sy={crop.sy}
      data-crop-sw={crop.sw}
      data-crop-sh={crop.sh}
      aria-label={t('guide.symbolCaption')}
    />
  );
}

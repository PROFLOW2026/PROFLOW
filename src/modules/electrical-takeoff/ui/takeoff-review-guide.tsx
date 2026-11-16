'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CatalogType, EffectiveDetection, SheetDto } from '../domain/contracts';
import { detectionDisplayLabel } from './boq-display';
import type { ReviewGroup, TypeSuggestion } from './review-guide';
import { symbolIdentityLabel } from './review-guide';
import { canSaveReclassifyToLibrary } from './takeoff-analysis-view';
import { TakeoffTypePicker } from './takeoff-type-picker';

export function TakeoffReviewGuide({
  group,
  focus,
  sheet,
  catalog,
  suggestions,
  separateOccurrences,
  readOnly,
  saving,
  progress,
  onConfirm,
}: {
  group: ReviewGroup;
  focus: EffectiveDetection;
  sheet: SheetDto | null;
  catalog: readonly CatalogType[];
  suggestions: readonly TypeSuggestion[];
  separateOccurrences: number;
  readOnly: boolean;
  saving: boolean;
  progress: { checked: number; total: number };
  onConfirm: (choice: { typeKey: string; saveToLibrary: boolean; detectionIds: string[] }) => Promise<boolean>;
}) {
  const t = useTranslations('takeoff');
  const [pick, setPick] = useState(group.typeKey ?? '');
  const [scope, setScope] = useState<'one' | 'group'>('one');
  const [saveLib, setSaveLib] = useState(false);
  const identity = symbolIdentityLabel(focus);
  const libraryAllowed = canSaveReclassifyToLibrary(focus, pick || null);
  const needsType = !pick;
  const scopeCount = scope === 'group' ? group.occurrences : 1;

  return (
    <section
      data-testid="takeoff-review-guide"
      data-focus-id={focus.id}
      data-group-ids={group.detectionIds.join(',')}
      className="shrink-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2"
    >
      <p className="text-xs font-medium text-[var(--pf-text-primary)]" data-testid="takeoff-guide-progress">
        {t('guide.progress', progress)}
      </p>
      <div className="mt-2 flex min-w-0 gap-2">
        <SymbolCrop detection={focus} sheet={sheet} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold text-[var(--pf-text-primary)]">
            {detectionDisplayLabel(focus, catalog, t('detection.unclassified'))}
          </p>
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('guide.occurrences', { count: group.occurrences })}</p>
          {identity ? (
            <p className="truncate text-xs text-[var(--pf-text-secondary)]">
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

      {suggestions.length > 0 ? (
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

      <div className="mt-2">
        <TakeoffTypePicker
          catalog={catalog}
          value={pick}
          disabled={readOnly || saving}
          testId="takeoff-guide-type"
          onChange={setPick}
        />
      </div>

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
        disabled={readOnly || saving || needsType}
        aria-busy={saving}
        onClick={() => {
          const ids = scope === 'group' ? group.detectionIds : [focus.id];
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

function SymbolCrop({ detection, sheet }: { detection: EffectiveDetection; sheet: SheetDto | null }) {
  const t = useTranslations('takeoff');
  if (!sheet?.previewUrl || detection.w <= 0 || detection.h <= 0) {
    return (
      <div className="flex size-28 shrink-0 items-center justify-center rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-1 text-center text-[10px] text-[var(--pf-text-muted)]">
        {t('viewer.noPreview')}
      </div>
    );
  }
  const boxW = Math.max(detection.w, 12) * 2.2;
  const boxH = Math.max(detection.h, 12) * 2.2;
  const left = detection.x - boxW / 2;
  const top = detection.y - boxH / 2;
  const display = 112;
  const scale = display / boxW;
  return (
    <div
      data-testid="takeoff-guide-symbol"
      className="size-28 shrink-0 overflow-hidden rounded-md border border-[var(--pf-border-default)] bg-white"
      style={{
        backgroundImage: `url(${sheet.previewUrl})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${sheet.widthPx * scale}px ${sheet.heightPx * scale}px`,
        backgroundPosition: `${-left * scale}px ${-top * scale}px`,
      }}
    />
  );
}

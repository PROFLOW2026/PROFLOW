'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { CatalogType, EffectiveDetection, TakeoffReviewReason, WorkerLegendEntry } from '../domain/contracts';
import { devicesFromNote, tagWithDeviceCount } from '../domain/quantity-notes';
import {
  canSaveReclassifyToLibrary,
  detectionTwinLabel,
  legendConflictOnDetection,
  legendDisplayText,
  visibleDetectionReasons,
} from './takeoff-analysis-view';
import { canSaveReviewIdentity } from '../domain/review-copy';
import { detectionDisplayLabel } from './boq-display';
import { resolveSaveReviewPlan } from './save-review-action';
import { TakeoffTypePicker, type TakeoffCatalogMutations } from './takeoff-type-picker';

export type DetectionSaveRequest = {
  typeKey: string | null;
  saveToLibrary: boolean;
  applyToGroup: boolean;
  confirm: boolean;
};

export function TakeoffDetectionSheet({
  detection,
  catalog,
  readOnly,
  reasonLabel,
  groupSize,
  defaultApplyToGroup = false,
  canManageLibrary = false,
  canManageCatalog = false,
  catalogMutations,
  onCatalogSaved,
  legendRows = [],
  saving = false,
  feedback = null,
  detections,
  onClose,
  onCommit,
  onSetNote,
  onDelete,
  onRestore,
  onRetry,
}: {
  detection: EffectiveDetection;
  catalog: readonly CatalogType[];
  readOnly: boolean;
  /** Detections that share this symbol's legend key or signature, including this one. */
  groupSize: number;
  /** When the mark belongs to a symbol group, applying the type covers that group. */
  defaultApplyToGroup?: boolean;
  canManageLibrary?: boolean;
  canManageCatalog?: boolean;
  catalogMutations?: TakeoffCatalogMutations;
  onCatalogSaved?: (type: CatalogType) => void;
  legendRows?: readonly WorkerLegendEntry[];
  saving?: boolean;
  feedback?: { tone: 'success' | 'danger' | 'info' | 'warning'; text: string } | null;
  detections?: readonly EffectiveDetection[];
  reasonLabel: (r: TakeoffReviewReason | string) => string;
  onClose: () => void;
  onCommit: (input: DetectionSaveRequest) => void;
  onSetNote: (tagText: string | null) => void;
  onDelete: () => void;
  onRestore: () => void;
  onRetry?: () => void;
}) {
  const t = useTranslations('takeoff');
  const conflict = legendConflictOnDetection(detection);
  const [saveLib, setSaveLib] = useState(false);
  const [applyToGroup, setApplyToGroup] = useState(defaultApplyToGroup && groupSize > 1 && !conflict);
  const [pick, setPick] = useState(detection.typeKey ?? '');
  const [deviceCount, setDeviceCount] = useState(() => devicesFromNote(detection.tagText));
  const [missingType, setMissingType] = useState(false);

  const confidenceBadge =
    detection.confidence === 'high'
      ? t('confidence.suggestedApproval')
      : t(`confidence.${detection.confidence}`);

  const twin = detectionTwinLabel(detection);
  const libraryAllowed = canManageLibrary && canSaveReclassifyToLibrary(detection, pick || null);
  const matchedLegend = legendRows.filter((row) => detection.legendRowIds?.includes(row.key));
  const reasons = visibleDetectionReasons(detection);
  const selectedTypeKey = pick || detection.typeKey || null;
  const typeName = useMemo(() => {
    return (
      catalog.find((item) => item.key === selectedTypeKey)?.nameHe?.trim() ||
      detection.userLabel?.trim() ||
      detection.originalText?.trim() ||
      t('detection.unclassified')
    );
  }, [catalog, detection.originalText, detection.userLabel, selectedTypeKey, t]);
  const groupOn = applyToGroup && groupSize > 1 && !conflict;
  const planPreview = resolveSaveReviewPlan({
    selected: detection,
    detections: detections ?? [detection],
    applyToGroup: groupOn,
    typeKey: selectedTypeKey,
    confirm: true,
    saveToLibrary: false,
  });
  const count = planPreview.includedCount;
  const skippedCount = planPreview.skippedCount;
  const canSave = canSaveReviewIdentity(selectedTypeKey, detection);
  const missingHint = t('guide.pickOrNameRequired');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const commit = (confirm: boolean) => {
    if (!canSave) {
      setMissingType(true);
      return;
    }
    setMissingType(false);
    onCommit({
      typeKey: selectedTypeKey,
      saveToLibrary: saveLib && libraryAllowed,
      applyToGroup: groupOn,
      confirm,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('detection.title')}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] max-w-[100vw] overflow-x-hidden overflow-y-auto rounded-t-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-lg lg:inset-x-auto lg:end-4 lg:bottom-4 lg:w-96 lg:max-w-[min(24rem,100vw)] lg:rounded-xl"
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {detectionDisplayLabel(detection, catalog, t('detection.unclassified'))}
          </h3>
          <p className="text-xs text-[var(--pf-text-muted)]">
            <span className="ms-1 font-mono">{detection.id}</span>
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 shrink-0 px-3"
          data-testid="takeoff-close-detection"
          onClick={onClose}
        >
          {t('common.close')} (Esc)
        </Button>
      </header>
      {feedback ? (
        <Alert tone={feedback.tone} className="mb-3" data-testid="takeoff-action-feedback">
          <p>{feedback.text}</p>
          {feedback.tone === 'danger' && onRetry ? (
            <Button type="button" size="sm" className="mt-2 min-h-11" onClick={onRetry} disabled={saving}>
              {t('detection.retry')}
            </Button>
          ) : null}
        </Alert>
      ) : null}
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.confidence')}</dt>
          <dd>{confidenceBadge}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.source')}</dt>
          <dd>{t(`source.${detection.source}`)}</dd>
        </div>
        {detection.identitySource && detection.identitySource !== 'uncertain' ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.identitySource')}</dt>
            <dd>{t(`detection.identity${detection.identitySource === 'legend' ? 'Legend' : detection.identitySource === 'library' ? 'Library' : detection.identitySource === 'manual' ? 'Manual' : 'Catalog'}`)}</dd>
          </div>
        ) : null}
        {detection.originalText ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.originalLegendName')}</dt>
            <dd>{detection.originalText}</dd>
          </div>
        ) : null}
        {twin ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.twin')}</dt>
            <dd>
              <span className="rounded-md bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs">
                {t(`detection.twinState.${twin}`)}
              </span>
            </dd>
          </div>
        ) : null}
        {detection.rawClass ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.rawClass')}</dt>
            <dd className="font-mono text-xs">{detection.rawClass}</dd>
          </div>
        ) : null}
        {detection.tagText ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.tag')}</dt>
            <dd>{detection.tagText}</dd>
          </div>
        ) : null}
        {matchedLegend.length > 0 ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.legendRows')}</dt>
            <dd className="space-y-1">
              {matchedLegend.map((row) => (
                <p key={row.key} data-testid="takeoff-detection-legend-row" className="text-sm">
                  {legendDisplayText(row)}
                </p>
              ))}
            </dd>
          </div>
        ) : null}
        {reasons.length ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.reasons')}</dt>
            <dd className="flex flex-wrap gap-1">
              {reasons.map((r) => (
                <span
                  key={r}
                  data-testid="takeoff-detection-reason"
                  data-reason={r}
                  className="rounded-md bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs"
                >
                  {reasonLabel(r)}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      {!readOnly ? (
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-medium text-[var(--pf-text-secondary)]">{t('detection.pickType')}</label>
          <TakeoffTypePicker
            catalog={catalog}
            value={pick}
            disabled={readOnly || saving}
            testId="takeoff-edit-type"
            onChange={(value) => {
              setPick(value);
              setMissingType(false);
            }}
            canManageCatalog={canManageCatalog}
            mutations={catalogMutations}
            onCatalogSaved={onCatalogSaved}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="takeoff-save-to-library"
              checked={saveLib}
              disabled={!libraryAllowed || saving}
              onChange={(e) => setSaveLib(e.target.checked)}
            />
            {t('detection.saveToLibrary')}
          </label>
          {!libraryAllowed ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('detection.libraryRequiresLegend')}</p>
          ) : (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('detection.libraryMaskHint')}</p>
          )}
          <label className="flex min-h-11 items-center justify-between gap-2 text-sm">
            <span>{t('detection.deviceCount')}</span>
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              data-testid="takeoff-device-count"
              className="min-h-11 w-20 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-2 text-end tabular-nums"
              value={deviceCount}
              disabled={readOnly || saving}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (!Number.isFinite(next)) return;
                const countValue = Math.min(99, Math.max(1, Math.floor(next)));
                setDeviceCount(countValue);
                onSetNote(tagWithDeviceCount(detection.tagText, countValue));
              }}
            />
          </label>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detection.deviceCountHint')}</p>
          {groupSize > 1 ? (
            <fieldset className="space-y-1" disabled={readOnly || saving || conflict}>
              <legend className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('guide.scopeTitle')}</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`takeoff-sheet-scope-${detection.id}`}
                  data-testid="takeoff-scope-one"
                  checked={!groupOn}
                  onChange={() => setApplyToGroup(false)}
                />
                {t('guide.scopeOne')}
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`takeoff-sheet-scope-${detection.id}`}
                  data-testid="takeoff-apply-symbol-group"
                  checked={groupOn}
                  disabled={conflict}
                  onChange={() => setApplyToGroup(true)}
                />
                {t('detection.applyToSymbolGroup', { count: groupSize })}
              </label>
              <p className="text-xs text-[var(--pf-text-secondary)]">
                {conflict ? t('guide.conflictForcesOne') : groupOn ? t('guide.appliesGroup', { count: groupSize }) : t('guide.appliesOne')}
              </p>
            </fieldset>
          ) : null}
          {canSave ? (
            <p className="text-sm font-medium text-[var(--pf-text-primary)]" data-testid="takeoff-about-to-confirm">
              {count === 1
                ? t('detection.aboutToConfirmOne', { type: typeName })
                : t('detection.aboutToConfirmGroup', { count, type: typeName })}
            </p>
          ) : null}
          {skippedCount > 0 ? (
            <p className="text-xs text-[var(--pf-status-warning-fg)]">{t('detection.confirmSkipped', { count: skippedCount })}</p>
          ) : null}
          {missingType || !canSave ? (
            <p className="text-xs text-[var(--pf-status-warning-fg)]" data-testid="takeoff-need-type">
              {missingHint}
            </p>
          ) : null}
          <Button
            type="button"
            data-testid="takeoff-confirm-detection"
            className="min-h-11 w-full"
            loading={saving}
            disabled={readOnly || saving || !canSave}
            title={!canSave ? missingHint : undefined}
            onClick={() => commit(true)}
          >
            {saving ? t('guide.saving') : t('detection.saveAndConfirmCount', { count })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="takeoff-apply-type"
            className="min-h-11 w-full"
            loading={saving}
            disabled={readOnly || saving || !canSave}
            title={!canSave ? missingHint : t('detection.applyTypeHint')}
            onClick={() => commit(false)}
          >
            {t('detection.applyType')}
          </Button>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('detection.applyTypeHint')}</p>
          <div className="flex gap-2">
            <Button type="button" data-testid="takeoff-delete-detection" variant="danger" className="min-h-11 flex-1" loading={saving} disabled={saving} onClick={onDelete}>
              {t('detection.delete')}
            </Button>
            <Button type="button" variant="secondary" className="min-h-11 flex-1" loading={saving} disabled={saving} onClick={onRestore}>
              {t('detection.restore')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

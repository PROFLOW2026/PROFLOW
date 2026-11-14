'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { CatalogType, EffectiveDetection, TakeoffReviewReason } from '../domain/contracts';
import { canSaveReclassifyToLibrary, detectionTwinLabel } from './takeoff-analysis-view';

export function TakeoffDetectionSheet({
  detection,
  catalog,
  readOnly,
  reasonLabel,
  onClose,
  onReclassify,
  onDelete,
  onRestore,
}: {
  detection: EffectiveDetection;
  catalog: readonly CatalogType[];
  readOnly: boolean;
  reasonLabel: (r: TakeoffReviewReason | string) => string;
  onClose: () => void;
  onReclassify: (typeKey: string | null, saveToLibrary: boolean) => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const t = useTranslations('takeoff');
  const [query, setQuery] = useState('');
  const [saveLib, setSaveLib] = useState(false);
  const [pick, setPick] = useState(detection.typeKey ?? '');

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return catalog;
    return catalog.filter((c) => c.nameHe.includes(q) || c.key.includes(q));
  }, [catalog, query]);

  const confidenceBadge =
    detection.confidence === 'high'
      ? t('confidence.suggestedApproval')
      : t(`confidence.${detection.confidence}`);

  const twin = detectionTwinLabel(detection);
  const libraryAllowed = canSaveReclassifyToLibrary(detection, pick || null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('detection.title')}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] max-w-[100vw] overflow-x-hidden overflow-y-auto rounded-t-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 shadow-lg lg:inset-x-auto lg:end-4 lg:bottom-4 lg:w-96 lg:max-w-[min(24rem,100vw)] lg:rounded-xl"
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{t('detection.title')}</h3>
          <p className="text-xs text-[var(--pf-text-muted)]">{detection.id}</p>
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
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.confidence')}</dt>
          <dd>{confidenceBadge}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.source')}</dt>
          <dd>{t(`source.${detection.source}`)}</dd>
        </div>
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
        {detection.reasons.length ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('detection.reasons')}</dt>
            <dd className="flex flex-wrap gap-1">
              {detection.reasons.map((r) => (
                <span key={r} className="rounded-md bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs">
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
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 text-sm"
            placeholder={t('detection.searchTypes')}
          />
          <select
            data-testid="takeoff-edit-type"
            className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 text-sm"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">{t('detection.unclassified')}</option>
            {filtered.map((c) => (
              <option key={c.key} value={c.key}>
                {c.nameHe}
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={saveLib}
              disabled={!libraryAllowed}
              onChange={(e) => setSaveLib(e.target.checked)}
            />
            {t('detection.saveToLibrary')}
          </label>
          {!libraryAllowed ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('detection.libraryRequiresLegend')}</p>
          ) : (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('detection.libraryMaskHint')}</p>
          )}
          <Button
            type="button"
            data-testid="takeoff-apply-type"
            className="min-h-11 w-full"
            onClick={() => onReclassify(pick || null, saveLib && libraryAllowed)}
          >
            {t('detection.applyType')}
          </Button>
          <div className="flex gap-2">
            <Button type="button" data-testid="takeoff-delete-detection" variant="danger" className="min-h-11 flex-1" onClick={onDelete}>
              {t('detection.delete')}
            </Button>
            <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={onRestore}>
              {t('detection.restore')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
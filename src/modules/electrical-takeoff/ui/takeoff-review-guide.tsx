'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { CatalogType, EffectiveDetection, SheetDto, WorkerLegendEntry } from '../domain/contracts';
import { canSaveReviewIdentity, reviewPlainKey } from '../domain/review-copy';
import { classifyLegendText, isLegendNoteText } from '../domain/legend-identity';
import { detectionDisplayLabel } from './boq-display';
import { defaultReviewScope, type ReviewGroup, type TypeSuggestion } from './review-guide';
import { symbolIdentityLabel } from './review-guide';
import { canSaveReclassifyToLibrary, legendConflictOnDetection, legendDisplayText } from './takeoff-analysis-view';
import { TakeoffTypePicker, type TakeoffCatalogMutations } from './takeoff-type-picker';
import { TakeoffSymbolGlyph } from './takeoff-symbol-glyph';

export type ReviewDecision = {
  detectionIds: string[];
  confirm: boolean;
  typeKey: string | null;
  saveToLibrary: boolean;
  label?: string;
  legendRowId?: string | null;
};

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
  canManageLibrary = false,
  canManageCatalog = false,
  catalogMutations,
  onCatalogSaved,
  legendRows = [],
  planSvgMarkup = null,
  feedback = null,
  skippedCount = 0,
  onRetry,
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
  onConfirm: (choice: ReviewDecision) => Promise<boolean>;
  canManageLibrary?: boolean;
  canManageCatalog?: boolean;
  catalogMutations?: TakeoffCatalogMutations;
  onCatalogSaved?: (type: CatalogType) => void;
  legendRows?: readonly WorkerLegendEntry[];
  planSvgMarkup?: string | null;
  feedback?: { tone: 'success' | 'danger' | 'info' | 'warning'; text: string } | null;
  skippedCount?: number;
  onRetry?: () => void;
}) {
  const t = useTranslations('takeoff');
  const marks = occurrences.length > 0 ? occurrences : [focus];
  const index = Math.max(0, marks.findIndex((item) => item.id === shownId));
  const current = marks[index] ?? focus;
  const conflict = legendConflictOnDetection(current);
  const [form, setForm] = useState({
    key: group.key,
    pick: group.typeKey ?? '',
    scope: defaultReviewScope({ ...group, reasons: conflict ? [...group.reasons, 'type_ambiguous'] : group.reasons }),
    saveLib: false,
    rename: '',
    legendPick: current.legendRowIds?.[0] ?? '',
    showType: !group.typeKey,
    showRename: false,
    showLegend: false,
    context: false,
  });
  if (form.key !== group.key) {
    setForm({
      key: group.key,
      pick: group.typeKey ?? '',
      scope: defaultReviewScope(group),
      saveLib: false,
      rename: '',
      legendPick: current.legendRowIds?.[0] ?? '',
      showType: !group.typeKey,
      showRename: false,
      showLegend: false,
      context: false,
    });
  }
  const pick = form.pick;
  const scope = conflict ? 'one' : form.scope;
  const saveLib = form.saveLib;
  const identity = symbolIdentityLabel(current);
  const matchedLegend = legendRows.filter((row) => (current.legendRowIds ?? []).includes(row.key));
  const legendTexts = Array.from(
    new Set(matchedLegend.map((row) => legendDisplayText(row).trim()).filter(Boolean)),
  );
  const pickedTypeName = catalog.find((type) => type.key === pick)?.nameHe?.trim();
  const proposedName = (form.rename.trim() || current.userLabel?.trim() || pickedTypeName || current.originalText?.trim() || detectionDisplayLabel(current, catalog, t('detection.unclassified')));
  const libraryAllowed = canManageLibrary && canSaveReclassifyToLibrary(current, pick || null);
  const canConfirm = canSaveReviewIdentity(pick || null, current, form.rename);
  const scopeCount = scope === 'group' ? group.occurrences : 1;
  const ids = scope === 'group' && !conflict ? group.detectionIds : [current.id];
  const plain = reviewPlainKey(current);
  const matchState = conflict
    ? 'conflict'
    : current.legendUnambiguous && current.originalText
      ? 'unambiguous'
      : matchedLegend.length === 0
        ? 'missing'
        : 'uncertain';

  const submit = (confirm: boolean) => {
    void onConfirm({
      detectionIds: ids,
      confirm,
      typeKey: pick || null,
      saveToLibrary: saveLib && libraryAllowed,
      label: form.rename.trim() || undefined,
      legendRowId: form.showLegend ? form.legendPick || null : undefined,
    });
  };

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

      <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-2" data-testid="takeoff-guide-plan-pane">
          <p className="mb-1 text-xs font-medium text-[var(--pf-text-secondary)]">{t('guide.planSide')}</p>
          <TakeoffSymbolGlyph
            detection={current}
            sheet={sheet}
            svgMarkup={planSvgMarkup}
            mode={form.context ? 'context' : 'focus'}
            highlight={false}
            className="aspect-square h-auto w-full"
            testId="takeoff-guide-symbol"
          />
          <label className="mt-1 flex min-h-11 items-center gap-2 text-xs">
            <input type="checkbox" checked={form.context} onChange={(event) => setForm((cur) => ({ ...cur, context: event.target.checked }))} />
            {t('guide.showContext')}
          </label>
        </div>
        <div className="min-w-0 rounded-md border border-[var(--pf-border-default)] p-2" data-testid="takeoff-guide-legend-pane">
          <p className="mb-1 text-xs font-medium text-[var(--pf-text-secondary)]">{t('guide.legendSide')}</p>
          {matchedLegend.length === 0 ? (
            <p className="text-xs text-[var(--pf-status-warning-fg)]" data-testid="takeoff-guide-legend-missing">
              {t('guide.legendMissing')}
            </p>
          ) : (
            <>
              <p className="text-[11px] text-[var(--pf-text-muted)]">{t('guide.legendNoSeparateCrop')}</p>
              {legendTexts.map((text) => (
                <p key={text} className="mt-1 break-words text-sm text-[var(--pf-text-primary)]" data-testid="takeoff-guide-legend-text">
                  {text}
                </p>
              ))}
            </>
          )}
          <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">{t('guide.proposedName')}</p>
          <p className="break-words text-sm font-semibold text-[var(--pf-text-primary)]">{proposedName}</p>
          <p className="mt-1 text-xs font-medium text-[var(--pf-status-warning-fg)]" data-testid="takeoff-guide-match">
            {t(`guide.match.${matchState}`)}
          </p>
        </div>
      </div>

      {marks.length > 1 ? (
        <div className="mt-2 flex items-center gap-1">
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

      <div className="mt-2 min-w-0 space-y-1">
        {current.identitySource && current.identitySource !== 'uncertain' ? (
          <p className="text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-guide-identity">
            {t(
              `detection.identity${current.identitySource === 'legend' ? 'Legend' : current.identitySource === 'library' ? 'Library' : current.identitySource === 'manual' ? 'Manual' : 'Catalog'}`,
            )}
          </p>
        ) : null}
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('guide.occurrences', { count: group.occurrences })}</p>
        {identity ? (
          <p className="break-words text-[11px] text-[var(--pf-text-muted)]">
            {t('guide.technicalOnly', { name: identity.value })}
          </p>
        ) : null}
        <p className="text-xs font-medium text-[var(--pf-status-warning-fg)]" data-testid="takeoff-guide-reason">
          {t(`guide.plain.${plain}`)}
        </p>
        {current.originalText && classifyLegendText(current.originalText) === 'linear' ? (
          <p className="text-xs text-[var(--pf-text-muted)]">{t('guide.plain.looksLikeLinear')}</p>
        ) : null}
        {current.originalText && classifyLegendText(current.originalText) === 'site_work' ? (
          <p className="text-xs text-[var(--pf-text-muted)]">{t('guide.plain.looksLikeSiteWork')}</p>
        ) : null}
        {current.originalText && isLegendNoteText(current.originalText) ? (
          <p className="text-xs text-[var(--pf-text-muted)]">{t('guide.plain.looksLikeNote')}</p>
        ) : null}
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
                  onClick={() => setForm((cur) => ({ ...cur, pick: suggestion.typeKey, showType: true }))}
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

      <div className="mt-2 flex min-w-0 flex-wrap gap-1">
        <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={readOnly} onClick={() => setForm((cur) => ({ ...cur, showRename: !cur.showRename }))}>
          {t('guide.actionRename')}
        </Button>
        <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={readOnly} onClick={() => setForm((cur) => ({ ...cur, showType: !cur.showType }))}>
          {t('guide.actionPickType')}
        </Button>
        {legendRows.length > 0 ? (
          <Button type="button" size="sm" variant="secondary" className="min-h-11" disabled={readOnly} onClick={() => setForm((cur) => ({ ...cur, showLegend: !cur.showLegend }))}>
            {t('guide.actionAssignLegend')}
          </Button>
        ) : null}
      </div>

      {form.showRename ? (
        <label className="mt-2 block text-xs">
          {t('guide.renameLabel')}
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-2 text-sm"
            value={form.rename}
            data-testid="takeoff-guide-rename"
            onChange={(event) => setForm((cur) => ({ ...cur, rename: event.target.value }))}
          />
        </label>
      ) : null}

      {form.showType ? (
        <div className="mt-2">
          <TakeoffTypePicker
            catalog={catalog}
            value={pick}
            disabled={readOnly || saving}
            testId="takeoff-guide-type"
            onChange={(value) => setForm((cur) => ({ ...cur, pick: value }))}
            canManageCatalog={canManageCatalog}
            mutations={catalogMutations}
            onCatalogSaved={onCatalogSaved}
          />
        </div>
      ) : null}

      {form.showLegend ? (
        <label className="mt-2 block text-xs">
          {t('guide.assignLegendLabel')}
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-2 text-sm"
            data-testid="takeoff-guide-assign-legend"
            value={form.legendPick}
            onChange={(event) => setForm((cur) => ({ ...cur, legendPick: event.target.value }))}
          >
            <option value="">{t('guide.assignLegendNone')}</option>
            {legendRows.filter((row) => !row.continuation).map((row) => (
              <option key={row.key} value={row.key}>
                {legendDisplayText(row)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {group.occurrences > 1 ? (
        <fieldset className="mt-2 space-y-1" disabled={readOnly || saving || conflict}>
          <legend className="text-xs font-medium text-[var(--pf-text-secondary)]">{t('guide.scopeTitle')}</legend>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name={`takeoff-guide-scope-${group.key}`}
              data-testid="takeoff-guide-scope-one"
              checked={scope === 'one'}
              onChange={() => setForm((cur) => ({ ...cur, scope: 'one' }))}
            />
            {t('guide.scopeOne')}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name={`takeoff-guide-scope-${group.key}`}
              data-testid="takeoff-guide-scope-group"
              checked={scope === 'group'}
              disabled={conflict}
              onChange={() => setForm((cur) => ({ ...cur, scope: 'group' }))}
            />
            {t('guide.scopeGroup', { count: group.occurrences })}
          </label>
          <p className="text-xs text-[var(--pf-text-secondary)]" data-testid="takeoff-guide-scope-note">
            {conflict ? t('guide.conflictForcesOne') : scope === 'one' ? t('guide.appliesOne') : t('guide.appliesGroup', { count: group.occurrences })}
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
          onChange={(event) => setForm((cur) => ({ ...cur, saveLib: event.target.checked }))}
        />
        {t('detection.saveToLibrary')}
      </label>

      {!canConfirm ? <p className="text-xs text-[var(--pf-status-warning-fg)]">{t('guide.pickOrNameRequired')}</p> : null}
      {canConfirm ? (
        <p className="text-sm font-medium text-[var(--pf-text-primary)]" data-testid="takeoff-about-to-confirm">
          {scopeCount === 1
            ? t('detection.aboutToConfirmOne', { type: proposedName })
            : t('detection.aboutToConfirmGroup', { count: scopeCount, type: proposedName })}
        </p>
      ) : null}
      {skippedCount > 0 ? (
        <p className="text-xs text-[var(--pf-status-warning-fg)]">{t('detection.confirmSkipped', { count: skippedCount })}</p>
      ) : null}
      {feedback ? (
        <Alert tone={feedback.tone} className="mt-2" data-testid="takeoff-action-feedback">
          <p>{feedback.text}</p>
          {feedback.tone === 'danger' && onRetry ? (
            <Button type="button" size="sm" className="mt-2 min-h-11" onClick={onRetry} disabled={saving}>
              {t('detection.retry')}
            </Button>
          ) : null}
        </Alert>
      ) : null}

      <Button
        type="button"
        data-testid="takeoff-guide-confirm"
        className="mt-2 min-h-11 w-full"
        loading={saving}
        disabled={readOnly || saving || !canConfirm}
        title={!canConfirm ? t('guide.pickOrNameRequired') : undefined}
        onClick={() => submit(true)}
      >
        <Check className="size-4" />
        {saving ? t('guide.saving') : t('guide.confirmMatch', { count: scopeCount })}
      </Button>
      <Button
        type="button"
        variant="secondary"
        data-testid="takeoff-guide-save-only"
        className="mt-1 min-h-11 w-full"
        loading={saving}
        disabled={readOnly || saving || !canConfirm}
        title={t('detection.applyTypeHint')}
        onClick={() => submit(false)}
      >
        {t('guide.saveWithoutConfirm')}
      </Button>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('detection.applyTypeHint')}</p>
    </section>
  );
}

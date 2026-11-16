'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import type { MeasurementRule, MeasurementRuleSet, SymbolLibraryEntry } from '../domain/contracts';
import { DEFAULT_RULE_SET } from '../domain/measurement';
import { useTakeoffApi } from './api-provider';
import { blurSelectOnWheel } from './blur-select-on-wheel';

const RULE_MODES: MeasurementRule['mode'][] = ['count_each', 'group_by_proximity', 'exclude'];

export function TakeoffRuleSetDialog({
  projectId,
  open,
  ruleSet,
  onClose,
  onSaved,
}: {
  projectId: string;
  open: boolean;
  ruleSet: MeasurementRuleSet;
  onClose: () => void;
  onSaved: (rs: MeasurementRuleSet) => void;
}) {
  const t = useTranslations('takeoff');
  const api = useTakeoffApi();
  const [draft, setDraft] = useState(ruleSet);
  if (!open) return null;

  const updateRule = (id: string, patch: Partial<MeasurementRule>) => {
    setDraft({
      ...draft,
      rules: draft.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const addRule = () => {
    const template = DEFAULT_RULE_SET.rules[0]!;
    const rule: MeasurementRule = {
      ...template,
      id: `rule-${Date.now()}`,
      label: t('rules.newRuleLabel'),
    };
    setDraft({ ...draft, rules: [...draft.rules, rule] });
  };

  const removeRule = (id: string) => {
    setDraft({ ...draft, rules: draft.rules.filter((r) => r.id !== id) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal>
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
        <h2 className="text-base font-semibold">{t('rules.title')}</h2>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('rules.hint')}</p>
        <label className="mt-3 text-xs font-medium">{t('rules.name')}</label>
        <input
          className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] px-3 text-sm"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {draft.rules.map((r) => (
            <li key={r.id} className="space-y-1 rounded-md border border-[var(--pf-border-default)] p-2 text-xs">
              <input
                className="min-h-11 w-full rounded-md border px-2 text-sm"
                value={r.label}
                onChange={(e) => updateRule(r.id, { label: e.target.value })}
              />
              <select
                className="min-h-11 w-full rounded-md border px-2 text-sm"
                value={r.mode}
                onWheel={blurSelectOnWheel}
                onChange={(e) => updateRule(r.id, { mode: e.target.value as MeasurementRule['mode'] })}
              >
                {RULE_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`rules.mode.${mode}`)}
                  </option>
                ))}
              </select>
              {r.mode === 'group_by_proximity' ? (
                <input
                  className="min-h-11 w-full rounded-md border px-2 text-sm"
                  inputMode="decimal"
                  placeholder={t('rules.proximityPx')}
                  value={r.proximity?.radiusPx ?? ''}
                  onChange={(e) => {
                    const radiusPx = Number(e.target.value);
                    updateRule(r.id, {
                      proximity: Number.isFinite(radiusPx) ? { radiusPx } : undefined,
                    });
                  }}
                />
              ) : null}
              <input
                className="min-h-11 w-full rounded-md border px-2 text-sm"
                placeholder={t('rules.appliesTypes')}
                value={r.appliesTo.typeKeys?.join(', ') ?? ''}
                onChange={(e) =>
                  updateRule(r.id, {
                    appliesTo: {
                      ...r.appliesTo,
                      typeKeys: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
              />
              <Button type="button" variant="danger" size="sm" className="min-h-11 w-full" onClick={() => removeRule(r.id)}>
                {t('rules.removeRule')}
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="secondary" className="mt-2 min-h-11" onClick={addRule}>
          <Plus className="size-4" />
          {t('rules.addRule')}
        </Button>
        <DialogFooter
          onClose={onClose}
          onSave={() => void api.saveRuleSet(projectId, draft).then(onSaved)}
          saveLabel={t('rules.save')}
          closeLabel={t('common.close')}
        />
      </div>
    </div>
  );
}

function DialogFooter({
  onClose,
  onSave,
  saveLabel,
  closeLabel,
}: {
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  closeLabel: string;
}) {
  return (
    <div className="mt-4 flex gap-2">
      <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={onClose}>
        {closeLabel}
      </Button>
      <Button type="button" className="min-h-11 flex-1" onClick={onSave}>
        {saveLabel}
      </Button>
    </div>
  );
}

export function TakeoffLibraryDialog({
  plannerKey,
  open,
  onClose,
}: {
  plannerKey: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('takeoff');
  const api = useTakeoffApi();
  const [entries, setEntries] = useState<SymbolLibraryEntry[]>([]);
  useEffect(() => {
    if (!open) return;
    void api.listLibrary(plannerKey).then(setEntries);
  }, [api, open, plannerKey]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center" role="dialog" aria-modal>
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
        <h2 className="text-base font-semibold">{t('library.title')}</h2>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('library.planner', { key: plannerKey })}</p>
        <ul className="mt-3 max-h-64 overflow-y-auto">
          {entries.length === 0 ? (
            <li className="py-2 text-sm text-[var(--pf-text-muted)]">{t('library.empty')}</li>
          ) : (
            entries.map((e) => (
              <li key={e.id} className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--pf-border-default)] py-2 text-sm">
                <span className="min-w-0 truncate">{e.label ?? e.typeKey}</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  className="min-h-11"
                  onClick={() => void api.deleteLibraryEntry(e.id).then(() => setEntries((prev) => prev.filter((x) => x.id !== e.id)))}
                >
                  {t('library.delete')}
                </Button>
              </li>
            ))
          )}
        </ul>
        <Button type="button" className="mt-4 min-h-11" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

export function TakeoffConflictBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] px-3 py-2 text-sm text-[var(--pf-status-danger-fg)]"
      role="alert"
    >
      <span className="min-w-0">{message}</span>
      <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={onDismiss}>
        ✕
      </Button>
    </div>
  );
}
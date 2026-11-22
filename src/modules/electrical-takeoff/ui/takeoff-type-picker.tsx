'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type {
  CatalogType,
  CatalogTypeArchiveInput,
  CatalogTypeCreateInput,
  CatalogTypeUpdateInput,
  ElectricalCategory,
} from '../domain/contracts';
import { findActiveNameDuplicate, isDefaultCatalogKey } from '../domain/catalog';
import { blurSelectOnWheel } from './blur-select-on-wheel';
import { takeoffErrorCode } from './takeoff-errors';
import { CATALOG_CATEGORY_ORDER, filterCatalog, groupCatalog } from './review-guide';

export type TakeoffCatalogMutations = {
  create: (input: CatalogTypeCreateInput) => Promise<CatalogType>;
  update: (input: CatalogTypeUpdateInput) => Promise<CatalogType>;
  archive: (input: CatalogTypeArchiveInput) => Promise<CatalogType>;
};

type DialogState =
  | { mode: 'closed' }
  | { mode: 'create'; category: ElectricalCategory | 'all'; nameHe: string }
  | { mode: 'edit'; key: string; nameHe: string; custom: boolean };

export function TakeoffTypePicker({
  catalog,
  value,
  onChange,
  disabled,
  testId,
  canManageCatalog = false,
  mutations,
  onCatalogSaved,
  onExcludeFromBoq,
  excludeDisabled = false,
}: {
  catalog: readonly CatalogType[];
  value: string;
  onChange: (typeKey: string) => void;
  disabled?: boolean;
  testId: string;
  canManageCatalog?: boolean;
  mutations?: TakeoffCatalogMutations;
  onCatalogSaved?: (type: CatalogType) => void;
  onExcludeFromBoq?: () => void;
  excludeDisabled?: boolean;
}) {
  const t = useTranslations('takeoff');
  const [category, setCategory] = useState<'all' | ElectricalCategory>('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const present = useMemo(
    () => CATALOG_CATEGORY_ORDER.filter((item) => catalog.some((type) => type.category === item && !type.archived)),
    [catalog],
  );
  const filtered = useMemo(
    () => filterCatalog(catalog, category, query, value),
    [catalog, category, query, value],
  );
  const grouped = useMemo(() => groupCatalog(filtered), [filtered]);
  const selected = catalog.find((type) => type.key === value);
  const showManage = Boolean(canManageCatalog && mutations && !disabled);
  const emptySearch = query.trim().length > 0 && filterCatalog(catalog, category, query, '').length === 0;

  function catalogErrorMessage(caught: unknown): string {
    const code = takeoffErrorCode(caught);
    if (code === 'catalog_duplicate' || code === 'catalog_invalid' || code === 'catalog_type_archived' || code === 'forbidden') {
      return t(`errors.${code}`);
    }
    if (caught instanceof Error && caught.message.trim()) return caught.message;
    return t('catalog.saveFailed');
  }

  function selectExistingType(type: CatalogType) {
    onChange(type.key);
    setQuery('');
    setDialog({ mode: 'closed' });
    setError(null);
  }

  async function submitCreate() {
    if (dialog.mode !== 'create' || !mutations) return;
    const chosenCategory = dialog.category === 'all' ? null : dialog.category;
    if (!chosenCategory) {
      setError(t('catalog.pickCategory'));
      return;
    }
    const existing = findActiveNameDuplicate(catalog, dialog.nameHe);
    if (existing) {
      selectExistingType(existing);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await mutations.create({ category: chosenCategory, nameHe: dialog.nameHe });
      onCatalogSaved?.(saved);
      onChange(saved.key);
      setQuery('');
      setDialog({ mode: 'closed' });
    } catch (caught) {
      setError(catalogErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (dialog.mode !== 'edit' || !mutations) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await mutations.update({ key: dialog.key, nameHe: dialog.nameHe });
      onCatalogSaved?.(saved);
      onChange(saved.key);
      setDialog({ mode: 'closed' });
    } catch (caught) {
      setError(catalogErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function submitArchive(archived: boolean) {
    if (dialog.mode !== 'edit' || !mutations || !dialog.custom) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await mutations.archive({ key: dialog.key, archived });
      onCatalogSaved?.(saved);
      if (archived && value === dialog.key) onChange('');
      setDialog({ mode: 'closed' });
    } catch (caught) {
      setError(catalogErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-1 overflow-x-hidden">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={`min-h-9 rounded-md px-2 text-xs ${category === 'all' ? 'bg-[var(--pf-action-primary-bg)] text-[var(--pf-action-primary-fg)]' : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]'}`}
          onClick={() => setCategory('all')}
        >
          {t('catalogCategory.all')}
        </button>
        {present.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-9 rounded-md px-2 text-xs ${category === item ? 'bg-[var(--pf-action-primary-bg)] text-[var(--pf-action-primary-fg)]' : 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]'}`}
            onClick={() => setCategory(item)}
          >
            {t(`catalogCategory.${item}`)}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('detection.searchTypes')}
        className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 text-sm"
      />
      <select
        data-testid={testId}
        className="min-h-11 w-full max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-2 text-sm"
        value={value}
        disabled={disabled}
        onWheel={blurSelectOnWheel}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('detection.unclassified')}</option>
        {grouped.map((group) => (
          <optgroup key={group.category} label={t(`catalogCategory.${group.category}`)}>
            {group.types.map((type) => (
              <option key={type.key} value={type.key}>
                {type.nameHe}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {showManage || onExcludeFromBoq ? (
        <div className="flex min-w-0 w-full flex-wrap gap-1">
          {onExcludeFromBoq ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11 min-w-[8.5rem] flex-1"
              data-testid={`${testId}-exclude`}
              disabled={disabled || saving || excludeDisabled}
              onClick={onExcludeFromBoq}
            >
              {t('catalog.excludeFromBoq')}
            </Button>
          ) : null}
          {showManage ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-11 min-w-[8.5rem] flex-1"
            data-testid={`${testId}-add`}
            disabled={saving}
            onClick={() => {
              setError(null);
              setDialog({
                mode: 'create',
                category,
                nameHe: query.trim(),
              });
            }}
          >
            {t('catalog.addAccessory')}
          </Button>
          ) : null}
          {showManage && selected && !selected.archived ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="min-h-11"
              data-testid={`${testId}-edit`}
              disabled={saving}
              onClick={() => {
                setError(null);
                setDialog({
                  mode: 'edit',
                  key: selected.key,
                  nameHe: selected.nameHe,
                  custom: !isDefaultCatalogKey(selected.key),
                });
              }}
            >
              {isDefaultCatalogKey(selected.key) ? t('catalog.editOrgName') : t('catalog.editAccessory')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {showManage && emptySearch ? (
        <button
          type="button"
          className="min-h-11 w-full rounded-md border border-dashed border-[var(--pf-border-default)] px-2 text-start text-xs"
          data-testid={`${testId}-add-search`}
          onClick={() => {
            setError(null);
            setDialog({ mode: 'create', category, nameHe: query.trim() });
          }}
        >
          {t('catalog.addNamed', { name: query.trim() })}
        </button>
      ) : null}

      {dialog.mode !== 'closed' ? (
        <div
          role="dialog"
          aria-modal="true"
          data-testid={`${testId}-catalog-dialog`}
          className="min-w-0 max-w-[100vw] overflow-x-hidden rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-2"
        >
          <p className="text-sm font-medium text-[var(--pf-text-primary)]">
            {dialog.mode === 'create'
              ? t('catalog.addTitle')
              : dialog.custom
                ? t('catalog.editTitle')
                : t('catalog.editOrgTitle')}
          </p>
          {dialog.mode === 'create' ? (
            <label className="mt-2 flex min-w-0 flex-col gap-1 text-xs text-[var(--pf-text-secondary)]">
              <span>{t('catalog.category')}</span>
              <select
                className="min-h-11 w-full max-w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-2 text-sm"
                value={dialog.category === 'all' ? '' : dialog.category}
                disabled={saving}
                onWheel={blurSelectOnWheel}
                onChange={(event) =>
                  setDialog({
                    ...dialog,
                    category: (event.target.value || 'all') as ElectricalCategory | 'all',
                  })
                }
              >
                <option value="">{t('catalog.pickCategory')}</option>
                {CATALOG_CATEGORY_ORDER.filter((item) => item !== 'unknown').map((item) => (
                  <option key={item} value={item}>
                    {t(`catalogCategory.${item}`)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="mt-2 flex min-w-0 flex-col gap-1 text-xs text-[var(--pf-text-secondary)]">
            <span>{t('catalog.name')}</span>
            <input
              className="min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-3 text-sm"
              value={dialog.nameHe}
              disabled={saving}
              data-testid={`${testId}-catalog-name`}
              onChange={(event) => setDialog({ ...dialog, nameHe: event.target.value })}
            />
          </label>
          {error ? (
            <p className="mt-1 text-xs text-[var(--pf-status-danger-fg)]" data-testid={`${testId}-catalog-error`}>
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex min-w-0 flex-wrap gap-1">
            <Button
              type="button"
              className="min-h-11"
              data-testid={`${testId}-catalog-save`}
              disabled={saving || !dialog.nameHe.trim()}
              aria-busy={saving}
              onClick={() => void (dialog.mode === 'create' ? submitCreate() : submitEdit())}
            >
              {saving ? t('guide.saving') : t('catalog.save')}
            </Button>
            {dialog.mode === 'edit' && dialog.custom ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                data-testid={`${testId}-catalog-archive`}
                disabled={saving}
                onClick={() => void submitArchive(true)}
              >
                {t('catalog.archive')}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              disabled={saving}
              onClick={() => setDialog({ mode: 'closed' })}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

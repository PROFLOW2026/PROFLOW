'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NavIcon } from '@/components/shell/nav-icon';
import {
  DASHBOARD_QUICK_ACCESS_MAX,
  type DashboardQuickAccessDefinition,
  type DashboardQuickAccessKey,
} from '@/modules/tenancy/domain/dashboard-quick-access';
import { saveDashboardQuickAccessAction, type SettingsActionState } from '../actions';

function shortcutLabel(
  entry: DashboardQuickAccessDefinition,
  tDashboard: ReturnType<typeof useTranslations<'dashboard'>>,
  tNav: ReturnType<typeof useTranslations<'nav'>>,
): string {
  return entry.labelNamespace === 'dashboard'
    ? tDashboard(`quickAccess.shortcuts.${entry.labelKey}`)
    : tNav(entry.labelKey);
}

export function DashboardQuickAccessPanel({
  initialKeys,
  catalog,
  canEdit,
}: {
  initialKeys: readonly DashboardQuickAccessKey[];
  catalog: readonly DashboardQuickAccessDefinition[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.dashboardDisplay');
  const tDashboard = useTranslations('dashboard');
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const [keys, setKeys] = useState<DashboardQuickAccessKey[]>([...initialKeys]);
  const [addKey, setAddKey] = useState<string>('');
  const [state, action, pending] = useActionState(saveDashboardQuickAccessAction, {} as SettingsActionState);

  const catalogByKey = useMemo(
    () => new Map(catalog.map((entry) => [entry.key, entry])),
    [catalog],
  );

  const selected = keys
    .map((key) => catalogByKey.get(key))
    .filter((entry): entry is DashboardQuickAccessDefinition => Boolean(entry));

  const availableToAdd = catalog.filter((entry) => !keys.includes(entry.key));

  function moveKey(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= keys.length) return;
    setKeys((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  function removeKey(key: DashboardQuickAccessKey) {
    setKeys((current) => current.filter((item) => item !== key));
  }

  function addShortcut() {
    if (!addKey || keys.includes(addKey as DashboardQuickAccessKey)) return;
    if (keys.length >= DASHBOARD_QUICK_ACCESS_MAX) return;
    setKeys((current) => [...current, addKey as DashboardQuickAccessKey]);
    setAddKey('');
  }

  return (
    <form action={action} className="flex flex-col gap-3 border-b border-[var(--pf-border-default)] pb-5">
      <div className="min-w-0">
        <p className="text-start font-medium">{t('shortcuts.title')}</p>
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">{t('shortcuts.subtitle')}</p>
      </div>

      <input type="hidden" name="shortcutKeys" value={JSON.stringify(keys)} />

      {selected.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('shortcuts.empty')}</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {selected.map((entry, index) => (
            <li
              key={entry.key}
              className="flex min-w-0 items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
            >
              <NavIcon iconKey={entry.iconKey} className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {shortcutLabel(entry, tDashboard, tNav)}
              </span>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => moveKey(index, -1)}
                    disabled={pending || index === 0}
                    aria-label={t('shortcuts.moveUp')}
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => moveKey(index, 1)}
                    disabled={pending || index === selected.length - 1}
                    aria-label={t('shortcuts.moveDown')}
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeKey(entry.key)}
                    disabled={pending}
                    aria-label={t('shortcuts.remove')}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit && availableToAdd.length > 0 && keys.length < DASHBOARD_QUICK_ACCESS_MAX ? (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={t('shortcuts.add')} className="min-w-0 flex-1 sm:max-w-sm">
            {(control) => (
              <Select value={addKey} onValueChange={setAddKey} disabled={pending}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={t('shortcuts.addPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((entry) => (
                    <SelectItem key={entry.key} value={entry.key}>
                      {shortcutLabel(entry, tDashboard, tNav)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={addShortcut}
            disabled={pending || !addKey}
            className="self-start sm:mb-0.5"
          >
            <Plus className="size-4" aria-hidden />
            {t('shortcuts.add')}
          </Button>
        </div>
      ) : null}

      {canEdit && keys.length >= DASHBOARD_QUICK_ACCESS_MAX ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('shortcuts.maxReached')}</p>
      ) : null}

      {canEdit ? (
        <Button type="submit" size="sm" variant="secondary" loading={pending} className="self-start">
          {tCommon('actions.save')}
        </Button>
      ) : null}

      {state.error ? (
        <Alert tone="danger" className="w-full">
          {state.error}
        </Alert>
      ) : null}
      {state.ok ? (
        <Alert tone="success" className="w-full" role="status" aria-live="polite">
          {t('shortcuts.saved')}
        </Alert>
      ) : null}
    </form>
  );
}

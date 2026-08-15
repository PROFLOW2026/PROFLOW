'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SavedListKey, SavedListViewRecord } from '@/modules/tenancy';
import { queriesMatch } from '@/modules/tenancy/domain/saved-list-views';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { deleteSavedListViewAction, saveSavedListViewAction } from './saved-list-views-actions';

const NONE = '__none__';

export function SavedListViewsControl({
  listKey,
  currentQuery,
  views,
}: {
  listKey: SavedListKey;
  currentQuery: Record<string, string>;
  views: readonly SavedListViewRecord[];
}) {
  const t = useTranslations('common.savedViews');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const matchingId = useMemo(
    () => views.find((view) => queriesMatch(view.query, currentQuery))?.id ?? NONE,
    [views, currentQuery],
  );
  const [selectedId, setSelectedId] = useState(matchingId);
  const [name, setName] = useState(
    views.find((view) => view.id === matchingId)?.name ?? '',
  );
  const [saveState, saveAction, saving] = useActionState(saveSavedListViewAction, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteSavedListViewAction, {});

  function loadView(id: string) {
    setSelectedId(id);
    if (id === NONE) {
      setName('');
      router.push(pathname);
      return;
    }
    const view = views.find((item) => item.id === id);
    if (!view) return;
    setName(view.name);
    const params = new URLSearchParams(view.query);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field label={t('label')} className="min-w-0 sm:w-52">
        {(control) => (
          <Select value={selectedId} onValueChange={loadView}>
            <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
              <SelectValue placeholder={t('placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('current')}</SelectItem>
              {views.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.isDefault ? t('defaultName', { name: view.name }) : view.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <form action={saveAction} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="listKey" value={listKey} />
        <input type="hidden" name="queryJson" value={JSON.stringify(currentQuery)} />
        <Field label={t('name')} className="min-w-0 sm:w-44">
          {(control) => (
            <Input
              {...control}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
            />
          )}
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-[var(--pf-text-secondary)]">
          <input type="checkbox" name="isDefault" value="1" />
          {t('makeDefault')}
        </label>
        <Button type="submit" variant="secondary" size="sm" loading={saving} className="shrink-0">
          {t('save')}
        </Button>
      </form>

      {selectedId !== NONE ? (
        <form action={deleteAction}>
          <input type="hidden" name="id" value={selectedId} />
          <Button type="submit" variant="ghost" size="sm" loading={deleting}>
            {tCommon('actions.delete')}
          </Button>
        </form>
      ) : null}

      {saveState.error || deleteState.error ? (
        <p className="text-sm text-[var(--pf-danger)]">{saveState.error ?? deleteState.error}</p>
      ) : null}
    </div>
  );
}

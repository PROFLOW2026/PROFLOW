'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
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
import {
  queriesMatch,
  type SavedListKey,
  type SavedListViewRecord,
} from '@/modules/tenancy/domain/saved-list-views';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { deleteSavedListViewAction, saveSavedListViewAction } from './saved-list-views-actions';

const NONE = '__none__';

function viewCanMutate(
  view: SavedListViewRecord,
  currentUserId: string,
  canManageOrganizationViews: boolean,
): boolean {
  if (view.scope === 'private') return view.userId === currentUserId;
  if (view.userId === currentUserId) return true;
  return canManageOrganizationViews;
}

export function SavedListViewsControl({
  listKey,
  currentQuery,
  views,
  currentUserId,
  canShareWithOrganization,
}: {
  listKey: SavedListKey;
  currentQuery: Record<string, string>;
  views: readonly SavedListViewRecord[];
  currentUserId: string;
  /** User may publish org-scoped views (`SETTINGS_MANAGE`). */
  canShareWithOrganization: boolean;
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
  const [shareWithOrganization, setShareWithOrganization] = useState(false);
  const [saveState, saveAction, saving] = useActionState(saveSavedListViewAction, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteSavedListViewAction, {});

  const selectedView = useMemo(
    () => (selectedId === NONE ? null : views.find((view) => view.id === selectedId) ?? null),
    [selectedId, views],
  );

  const canMutateSelection =
    selectedView === null ||
    viewCanMutate(selectedView, currentUserId, canShareWithOrganization);

  function loadView(id: string) {
    setSelectedId(id);
    if (id === NONE) {
      setName('');
      setShareWithOrganization(false);
      router.push(pathname);
      return;
    }
    const view = views.find((item) => item.id === id);
    if (!view) return;
    setName(view.name);
    setShareWithOrganization(view.scope === 'organization');
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
                  <span className="flex items-center gap-2">
                    <span>
                      {view.isDefault ? t('defaultName', { name: view.name }) : view.name}
                    </span>
                    {view.scope === 'organization' ? (
                      <Badge tone="neutral" className="shrink-0 text-[10px]">
                        {t('organizationBadge')}
                      </Badge>
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <form action={saveAction} className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="listKey" value={listKey} />
        <input type="hidden" name="queryJson" value={JSON.stringify(currentQuery)} />
        {shareWithOrganization ? <input type="hidden" name="scope" value="organization" /> : null}
        <Field label={t('name')} className="min-w-0 sm:w-44">
          {(control) => (
            <Input
              {...control}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
              readOnly={!canMutateSelection}
              disabled={!canMutateSelection}
            />
          )}
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-[var(--pf-text-secondary)]">
          <input
            type="checkbox"
            name="isDefault"
            value="1"
            disabled={!canMutateSelection}
          />
          {t('makeDefault')}
        </label>
        {canShareWithOrganization ? (
          <label className="flex items-center gap-2 pb-2 text-sm text-[var(--pf-text-secondary)]">
            <input
              type="checkbox"
              checked={shareWithOrganization}
              onChange={(event) => setShareWithOrganization(event.target.checked)}
              disabled={!canMutateSelection}
            />
            {t('shareWithOrganization')}
          </label>
        ) : null}
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          loading={saving}
          className="shrink-0"
          disabled={!canMutateSelection}
        >
          {t('save')}
        </Button>
      </form>

      {selectedId !== NONE && canMutateSelection ? (
        <form action={deleteAction}>
          <input type="hidden" name="id" value={selectedId} />
          <Button type="submit" variant="ghost" size="sm" loading={deleting}>
            {tCommon('actions.delete')}
          </Button>
        </form>
      ) : null}

      {selectedView && !canMutateSelection ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('readOnlyOrganizationView')}</p>
      ) : null}

      {saveState.error || deleteState.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{saveState.error ?? deleteState.error}</p>
      ) : null}
    </div>
  );
}

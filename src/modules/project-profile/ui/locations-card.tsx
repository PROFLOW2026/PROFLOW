'use client';

import { Archive, ChevronDown, ChevronLeft, ChevronRight, MapPin, MoveRight, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import { LOCALE_METADATA, isLocale } from '@/shared/i18n/config';
import { cn } from '@/shared/ui/cn';
import { LOCATION_TYPES, buildLocationIndex, type LocationIndex, type LocationNode, type LocationType } from '../domain/locations';
import { LocationGeneratorPanel } from './location-generator-panel';
import { LocationPicker } from './location-picker';
import type { ProjectStructureActions } from './types';
import { useStructureAction } from './use-structure-action';

type Editor =
  | { readonly mode: 'create'; readonly parentId: string | null }
  | { readonly mode: 'edit'; readonly node: LocationNode }
  | { readonly mode: 'move'; readonly node: LocationNode };

/** Sensible default child type per parent type. */
const CHILD_TYPE: Partial<Record<LocationType, LocationType>> = {
  site: 'building',
  building: 'floor',
  wing: 'floor',
  floor: 'apartment',
  basement: 'area',
  parking: 'area',
  apartment: 'room',
  unit: 'room',
};

export function LocationsCard({
  projectId,
  locations,
  canEdit,
  actions,
}: {
  readonly projectId: string;
  readonly locations: readonly LocationNode[];
  readonly canEdit: boolean;
  readonly actions: Pick<
    ProjectStructureActions,
    'createLocation' | 'updateLocation' | 'moveLocation' | 'archiveLocation' | 'restoreLocation' | 'generateLocations'
  >;
}) {
  const t = useTranslations('projectProfile');
  const locale = useLocale();
  const rtl = isLocale(locale) && LOCALE_METADATA[locale].dir === 'rtl';
  const action = useStructureAction();
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const visible = useMemo(
    () => (showArchived ? locations : locations.filter((node) => !node.archived)),
    [locations, showArchived],
  );
  const index = useMemo(() => buildLocationIndex(visible), [visible]);
  const activeCount = locations.filter((node) => !node.archived).length;

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const archive = (node: LocationNode) => {
    if (!window.confirm(t('locations.confirmArchive', { name: node.name }))) return;
    action.run(actions.archiveLocation, { projectId, locationId: node.id }, (result) =>
      t('locations.archivedToast', { count: result.count ?? 1 }),
    );
  };

  const restore = (node: LocationNode) =>
    action.run(actions.restoreLocation, { projectId, locationId: node.id }, () => t('locations.restored'));

  const setActive = (node: LocationNode, isActive: boolean) =>
    action.run(actions.updateLocation, { projectId, locationId: node.id, isActive }, () => t('locations.updated'));

  const openCreate = (parentId: string | null) => {
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
    setEditor({ mode: 'create', parentId });
  };

  const renderEditor = (current: Editor) => (
    <LocationEditor
      key={`${current.mode}-${current.mode === 'create' ? (current.parentId ?? 'root') : current.node.id}`}
      editor={current}
      projectId={projectId}
      index={index}
      locations={locations}
      actions={actions}
      onDone={() => setEditor(null)}
    />
  );

  const renderNodes = (parentId: string | null, depth: number): ReactNode => {
    const children = index.childrenOf.get(parentId) ?? [];
    if (children.length === 0) return null;
    return (
      <ul className={cn('flex flex-col gap-1', depth > 0 && 'ms-3 border-s border-[var(--pf-border-default)] ps-2 sm:ms-5 sm:ps-3')}>
        {children.map((node) => {
          const childCount = index.childrenOf.get(node.id)?.length ?? 0;
          const isOpen = expanded.has(node.id);
          const CollapsedIcon = rtl ? ChevronLeft : ChevronRight;
          return (
            <li key={node.id} className="flex flex-col gap-1">
              <div
                className={cn(
                  'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1.5 hover:bg-[var(--pf-bg-muted)]',
                  (node.archived || !node.isActive) && 'opacity-70',
                )}
              >
                {childCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    aria-expanded={isOpen}
                    aria-label={isOpen ? t('locations.collapse') : t('locations.expand')}
                    onClick={() => toggle(node.id)}
                  >
                    {isOpen ? <ChevronDown aria-hidden /> : <CollapsedIcon aria-hidden />}
                  </Button>
                ) : (
                  <span className="inline-flex size-11 items-center justify-center md:size-8" aria-hidden>
                    <MapPin className="size-4 text-[var(--pf-text-muted)]" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{node.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--pf-text-secondary)]">
                    <span>{t(`locationTypes.${node.type}`)}</span>
                    {node.code ? (
                      <bdi className="pf-ltr-island rounded bg-[var(--pf-bg-muted)] px-1.5 font-mono">{node.code}</bdi>
                    ) : null}
                    {childCount > 0 ? <span>· {childCount}</span> : null}
                    {node.archived ? <Badge tone="neutral">{t('locations.archived')}</Badge> : null}
                    {!node.archived && !node.isActive ? <Badge tone="warning">{t('locations.inactive')}</Badge> : null}
                  </span>
                </span>
                {canEdit ? (
                  <span className="flex shrink-0 items-center gap-0.5" role="group" aria-label={t('locations.actions')}>
                    {node.archived ? (
                      <Button type="button" variant="ghost" size="sm" disabled={action.pending} onClick={() => restore(node)}>
                        <RotateCcw aria-hidden />
                        {t('locations.restore')}
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          aria-label={t('locations.addChild')}
                          title={t('locations.addChild')}
                          onClick={() => openCreate(node.id)}
                        >
                          <Plus aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          aria-label={t('locations.edit')}
                          title={t('locations.edit')}
                          onClick={() => setEditor({ mode: 'edit', node })}
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          aria-label={t('locations.move')}
                          title={t('locations.move')}
                          onClick={() => setEditor({ mode: 'move', node })}
                        >
                          <MoveRight aria-hidden className="rtl:-scale-x-100" />
                        </Button>
                        <Button
                          type="button"
                          variant="dangerGhost"
                          size="iconSm"
                          aria-label={t('locations.archive')}
                          title={t('locations.archive')}
                          disabled={action.pending}
                          onClick={() => archive(node)}
                        >
                          <Archive aria-hidden />
                        </Button>
                      </>
                    )}
                  </span>
                ) : null}
              </div>
              {canEdit && editor && editor.mode !== 'create' && editor.node.id === node.id ? (
                <div className="ms-2">
                  {renderEditor(editor)}
                  {editor.mode === 'edit' ? (
                    <label className="mt-2 flex min-h-11 items-center gap-3" htmlFor={`location-active-${node.id}`}>
                      <Checkbox
                        id={`location-active-${node.id}`}
                        checked={node.isActive}
                        disabled={action.pending}
                        onCheckedChange={(checked) => setActive(node, checked === true)}
                      />
                      <span className="text-sm">{node.isActive ? t('locations.markInactive') : t('locations.markActive')}</span>
                    </label>
                  ) : null}
                </div>
              ) : null}
              {canEdit && editor?.mode === 'create' && editor.parentId === node.id ? (
                <div className="ms-6">{renderEditor(editor)}</div>
              ) : null}
              {isOpen ? renderNodes(node.id, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Card id="locations">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>{t('locations.title')}</CardTitle>
            <CardDescription>{t('locations.description')}</CardDescription>
          </div>
          <Badge tone="neutral">{t('locations.count', { count: activeCount })}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit ? (
          <LocationGeneratorPanel projectId={projectId} locations={locations} generateLocations={actions.generateLocations} />
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex min-h-11 items-center gap-3" htmlFor="locations-show-archived">
            <Checkbox
              id="locations-show-archived"
              checked={showArchived}
              onCheckedChange={(checked) => setShowArchived(checked === true)}
            />
            <span className="text-sm">{t('locations.showArchived')}</span>
          </label>
          {canEdit ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => openCreate(null)}>
              <Plus aria-hidden />
              {t('locations.addRoot')}
            </Button>
          ) : null}
        </div>

        {canEdit && editor?.mode === 'create' && editor.parentId === null ? renderEditor(editor) : null}

        {action.error ? (
          <Alert tone="danger" role="alert">
            <p className="text-sm">{action.error}</p>
          </Alert>
        ) : null}
        {action.status ? <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">{action.status}</p> : null}

        {visible.length === 0 ? (
          <EmptyState icon={MapPin} title={t('locations.empty')} description={t('locations.emptyDescription')} size="sm" />
        ) : (
          <nav aria-label={t('locations.title')}>{renderNodes(null, 0)}</nav>
        )}
      </CardContent>
    </Card>
  );
}

function LocationEditor({
  editor,
  projectId,
  index,
  locations,
  actions,
  onDone,
}: {
  readonly editor: Editor;
  readonly projectId: string;
  readonly index: LocationIndex;
  readonly locations: readonly LocationNode[];
  readonly actions: Pick<ProjectStructureActions, 'createLocation' | 'updateLocation' | 'moveLocation'>;
  readonly onDone: () => void;
}) {
  const t = useTranslations('projectProfile');
  const action = useStructureAction();
  const parentType = editor.mode === 'create' && editor.parentId ? index.byId.get(editor.parentId)?.type : undefined;
  const [name, setName] = useState(editor.mode === 'create' ? '' : editor.node.name);
  const [code, setCode] = useState(editor.mode === 'create' ? '' : (editor.node.code ?? ''));
  const [type, setType] = useState<LocationType>(
    editor.mode === 'create' ? ((parentType && CHILD_TYPE[parentType]) ?? 'building') : editor.node.type,
  );
  const [parentId, setParentId] = useState<string | null>(editor.mode === 'move' ? editor.node.parentId : null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editor.mode === 'create') {
      action.run(
        actions.createLocation,
        { projectId, parentId: editor.parentId, type, name, code: code.trim() || null },
        () => t('locations.created'),
        onDone,
      );
    } else if (editor.mode === 'edit') {
      action.run(
        actions.updateLocation,
        { projectId, locationId: editor.node.id, type, name, code: code.trim() || null },
        () => t('locations.updated'),
        onDone,
      );
    } else {
      action.run(
        actions.moveLocation,
        { projectId, locationId: editor.node.id, parentId },
        () => t('locations.moved'),
        onDone,
      );
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3"
    >
      {editor.mode === 'move' ? (
        <Field label={t('locations.moveTo')}>
          {(props) => (
            <LocationPicker
              {...props}
              locations={locations.filter((node) => !node.archived)}
              value={parentId}
              onChange={setParentId}
              excludeSubtreesOf={[editor.node.id]}
              disabled={action.pending}
            />
          )}
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label={t('locations.name')} required error={action.fieldErrors.name}>
            {(props) => (
              <Input
                {...props}
                value={name}
                required
                maxLength={200}
                autoFocus
                disabled={action.pending}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('locations.code')} error={action.fieldErrors.code}>
            {(props) => (
              <Input
                {...props}
                value={code}
                maxLength={40}
                dir="ltr"
                disabled={action.pending}
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('locations.type')}>
            {(props) => (
              <select
                {...props}
                className={inputClassName}
                value={type}
                disabled={action.pending}
                onChange={(event) => setType(event.target.value as LocationType)}
              >
                {LOCATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`locationTypes.${value}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      )}
      {action.error ? (
        <Alert tone="danger" role="alert">
          <p className="text-sm">{action.error}</p>
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={action.pending}>
          {t('locations.cancel')}
        </Button>
        <Button type="submit" size="sm" loading={action.pending}>
          {t('locations.save')}
        </Button>
      </div>
    </form>
  );
}

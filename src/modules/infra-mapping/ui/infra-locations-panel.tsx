'use client';

import { Archive, ChevronDown, ChevronLeft, CloudOff, Cloud, Layers, Link2, MapPin, Pencil, Plus, RotateCcw, Search, Wrench } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import {
  LOCATION_TYPES,
  buildLocationIndex,
  locationPath,
  type LocationNode,
  type LocationType,
} from '@/modules/project-profile/domain/locations';
import { isLevelType, isUnitType, unitLevels } from '@/modules/project-profile/domain/unit-levels';
import type { StructureActionResult } from '@/modules/project-profile/ui/types';
import { cn } from '@/shared/ui/cn';
import {
  infraAddUnitsAction,
  infraArchiveLocationAction,
  infraCreateFolderAction,
  infraCreateLocationAction,
  infraCreateStructureAction,
  infraInspectFolderAction,
  infraMoveLocationAction,
  infraRecreateFolderAction,
  infraResolveFolderDriftAction,
  infraRestoreLocationAction,
  infraSetSpaceLevelAction,
  infraSetUnitKindAction,
  infraSetUnitLevelsAction,
  infraUpdateLocationAction,
  linkInfraFolderAction,
  syncInfraFoldersAction,
} from '../actions';
import { FOLDER_MISSING, placementOf, type PlacementNode } from '../domain/folder-placement';
import type { InfraFolderStatusDto, InfraLocationOption } from '../domain/types';
import { InfraFolderPicker } from './infra-folder-picker';
import { AddChildForm, LOCATION_TYPE_LABELS, NodeEditor, type FolderTools, type NodeActions } from './location-node-panels';
import { StructureWizard } from './structure-wizard';
import { TREE_TEXT as T } from './structure-texts';

const MAX_SYNC_ROUNDS = 80;
const PAGE = 50;
const SEARCH_LIMIT = 50;

function toLocationNode(node: InfraLocationOption): LocationNode {
  const type = (LOCATION_TYPES as readonly string[]).includes(node.type) ? (node.type as LocationType) : 'area';
  return { ...node, type };
}

type Panel = { readonly kind: 'edit' | 'add'; readonly id: string | null };

/**
 * "מיקומים ותיקיות": the logical structure (buildings, levels, units, rooms) with a wizard for creating it,
 * and the OPTIONAL cloud folder of each location. Locations are virtual - a folder is only created by the first
 * upload or on an explicit request - so a location without a folder is normal, never "missing".
 */
export function InfraLocationsPanel({
  projectId,
  locations,
  folders,
  canManage,
  storageConnected = true,
  browserActions,
  onChanged,
}: {
  readonly projectId: string;
  readonly locations: readonly InfraLocationOption[];
  readonly folders: readonly InfraFolderStatusDto[];
  readonly canManage: boolean;
  /** False when the organization has no active cloud connection (the structure is still manageable). */
  readonly storageConnected?: boolean;
  /** Storage browser (only for viewers allowed to browse the connected storage). */
  readonly browserActions?: ProjectCloudFileBrowserActions;
  readonly onChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [limits, setLimits] = useState<Readonly<Record<string, number>>>({});
  const [panel, setPanel] = useState<Panel | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info' | 'warning'; text: string } | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [linkTarget, setLinkTarget] = useState<{ locationId: string | null } | null>(null);

  const allNodes = useMemo(() => locations.map(toLocationNode), [locations]);
  const nodes = useMemo(() => (showArchived ? allNodes : allNodes.filter((node) => !node.archived)), [allNodes, showArchived]);
  const index = useMemo(() => buildLocationIndex(nodes), [nodes]);
  const fullIndex = useMemo(() => buildLocationIndex(allNodes), [allNodes]);
  const placementTree: readonly PlacementNode[] = useMemo(
    () =>
      allNodes.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        code: node.code,
        type: node.type,
        structure: node.structure ?? null,
        archived: node.archived,
      })),
    [allNodes],
  );
  const folderByLocation = useMemo(() => {
    const map = new Map<string, InfraFolderStatusDto>();
    for (const folder of folders) if (folder.locationId) map.set(folder.locationId, folder);
    return map;
  }, [folders]);
  const rootFolder = folders.find((folder) => folder.locationId === null) ?? null;
  const readyCount = folders.filter((folder) => folder.locationId && folder.status === 'ready').length;
  const repairable = folders.filter((folder) => folder.locationId && folder.status !== 'ready' && folder.lastError !== FOLDER_MISSING).length;
  const missingCount = folders.filter((folder) => folder.locationId && folder.status === 'error' && folder.lastError === FOLDER_MISSING).length;
  const activeCount = allNodes.filter((node) => !node.archived).length;

  const anchorFolderOf = useCallback(
    (id: string): InfraFolderStatusDto | null => {
      const anchor = placementOf(placementTree, id)?.anchorId;
      const row = anchor ? folderByLocation.get(anchor) : undefined;
      return row && row.status === 'ready' ? row : null;
    },
    [placementTree, folderByLocation],
  );

  const done = (text: string, warning?: string) => {
    setPanel(null);
    if (warning) setMessage({ tone: 'warning', text: `${text} ${warning}`.trim() });
    else if (text) setMessage({ tone: 'success', text });
    onChanged();
  };

  const wrap =
    <P,>(action: (payload: P) => Promise<StructureActionResult>) =>
    async (payload: P): Promise<StructureActionResult> => {
      const result = await action(payload);
      return result;
    };

  const actions: NodeActions = {
    create: wrap(infraCreateLocationAction as never),
    addUnits: wrap(infraAddUnitsAction as never),
    update: wrap(infraUpdateLocationAction as never),
    move: wrap(infraMoveLocationAction as never),
    setUnitKind: wrap(infraSetUnitKindAction as never),
    setUnitLevels: wrap(infraSetUnitLevelsAction as never),
    setSpaceLevel: wrap(infraSetSpaceLevelAction as never),
  };

  async function repair() {
    setRepairing(true);
    setMessage(null);
    let previous = Number.POSITIVE_INFINITY;
    try {
      for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
        const result = await syncInfraFoldersAction({ projectId });
        if (!result.ok) return setMessage({ tone: 'danger', text: result.error });
        const { remaining, failed } = result.data;
        if (remaining === 0) return setMessage({ tone: 'success', text: T.repairDone });
        if (remaining >= previous && failed.length > 0) return setMessage({ tone: 'danger', text: T.repairFailed });
        previous = remaining;
        setMessage({ tone: 'info', text: T.repairProgress.replace('{n}', String(remaining)) });
      }
      setMessage({ tone: 'danger', text: T.repairFailed });
    } finally {
      setRepairing(false);
      onChanged();
    }
  }

  const folderTools: FolderTools | null = canManage
    ? {
        canLink: Boolean(browserActions),
        async createFolder(locationId) {
          const result = await infraCreateFolderAction({ projectId, locationId });
          onChanged();
          return result.ok ? T.folderCreated : result.error;
        },
        async inspect(locationId) {
          const result = await infraInspectFolderAction({ projectId, locationId });
          if (!result.ok) return result.error;
          if (result.data.state === 'missing') onChanged();
          return result.data;
        },
        async resolveDrift(locationId, choice) {
          const result = await infraResolveFolderDriftAction({ projectId, locationId, choice });
          onChanged();
          return result.ok ? null : result.error;
        },
        async recreate(locationId) {
          const result = await infraRecreateFolderAction({ projectId, locationId });
          onChanged();
          return result.ok ? null : result.error;
        },
        link: (locationId) => setLinkTarget({ locationId }),
        async createBranch(locationId) {
          const node = fullIndex.byId.get(locationId);
          if (!window.confirm(T.createForBranchConfirm.replace('{name}', node?.name ?? ''))) return null;
          let previous = Number.POSITIVE_INFINITY;
          for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
            const result = await syncInfraFoldersAction({ projectId, locationIds: [locationId] });
            if (!result.ok) return result.error;
            if (result.data.remaining === 0) {
              onChanged();
              return T.branchDone;
            }
            if (result.data.remaining >= previous && result.data.failed.length > 0) return T.repairFailed;
            previous = result.data.remaining;
          }
          return T.repairFailed;
        },
      }
    : null;

  async function linkFolder(folder: { id: string; name: string }) {
    if (!linkTarget) return;
    const result = await linkInfraFolderAction({ projectId, locationId: linkTarget.locationId, externalFolderId: folder.id });
    if (!result.ok) return setMessage({ tone: 'danger', text: result.error });
    setMessage({ tone: 'success', text: T.link });
    onChanged();
  }

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const archive = async (node: LocationNode) => {
    if (!window.confirm(T.confirmArchive.replace('{name}', node.name))) return;
    const result = await infraArchiveLocationAction({ projectId, locationId: node.id });
    if (!result.ok) return setMessage({ tone: 'danger', text: result.error });
    done(T.archivedToast);
  };
  const restore = async (node: LocationNode) => {
    const result = await infraRestoreLocationAction({ projectId, locationId: node.id });
    if (!result.ok) return setMessage({ tone: 'danger', text: result.error });
    done(T.restoredToast);
  };

  function statusBadge(node: LocationNode): ReactNode {
    const own = folderByLocation.get(node.id);
    if (own) {
      if (own.status === 'error') {
        return own.lastError === FOLDER_MISSING ? (
          <Badge tone="danger">{T.folderMissing}</Badge>
        ) : (
          <Badge tone="warning">{T.folderError}</Badge>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 text-xs text-[var(--pf-status-success-fg)]">
          <Cloud className="size-3.5" aria-hidden />
          {own.displayName}
        </span>
      );
    }
    return null;
  }

  function renderNode(node: LocationNode, depth: number, path?: string): ReactNode {
    const children = index.childrenOf.get(node.id) ?? [];
    const isOpen = expanded.has(node.id);
    const levelsCount = isUnitType(node.type) ? unitLevels(index, node).length : 0;
    const editing = panel?.id === node.id ? panel.kind : null;
    return (
      <li key={node.id} className="flex min-w-0 flex-col gap-1" data-testid="location-row" data-location-id={node.id}>
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-1.5 hover:bg-[var(--pf-bg-muted)]',
            node.archived && 'opacity-70',
          )}
          style={depth > 0 ? { paddingInlineStart: `${Math.min(depth, 6) * 0.75}rem` } : undefined}
        >
          {children.length > 0 && !path ? (
            <Button
              type="button"
              variant="ghost"
              size="iconSm"
              aria-expanded={isOpen}
              aria-label={isOpen ? T.collapse : T.expand}
              onClick={() => toggle(node.id)}
            >
              {isOpen ? <ChevronDown aria-hidden /> : <ChevronLeft aria-hidden className="rtl:rotate-0 ltr:rotate-180" />}
            </Button>
          ) : (
            <span className="inline-flex size-11 items-center justify-center md:size-8" aria-hidden>
              <MapPin className="size-4 text-[var(--pf-text-muted)]" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{node.name}</span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--pf-text-secondary)]">
              <span>{LOCATION_TYPE_LABELS[node.type]}</span>
              {node.code ? <bdi className="rounded bg-[var(--pf-bg-muted)] px-1.5 font-mono">{node.code}</bdi> : null}
              {levelsCount > 1 ? (
                <span className="inline-flex items-center gap-1">
                  <Layers className="size-3" aria-hidden />
                  {T.multiBadge.replace('{n}', String(levelsCount))}
                </span>
              ) : null}
              {children.length > 0 && !path ? <span>· {children.length}</span> : null}
              {node.archived ? <Badge tone="neutral">{T.archivedBadge}</Badge> : null}
              {path ? <span className="truncate">{path}</span> : null}
              {statusBadge(node)}
            </span>
          </span>
          {canManage ? (
            <span className="flex shrink-0 items-center gap-0.5" role="group" aria-label={T.actions}>
              {node.archived ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => void restore(node)}>
                  <RotateCcw aria-hidden />
                  {T.restore}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    aria-label={T.addChild}
                    title={T.addChild}
                    onClick={() => {
                      setExpanded((current) => new Set(current).add(node.id));
                      setPanel({ kind: 'add', id: node.id });
                    }}
                  >
                    <Plus aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="iconSm"
                    aria-label={T.edit}
                    title={T.edit}
                    onClick={() => setPanel({ kind: 'edit', id: node.id })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="dangerGhost"
                    size="iconSm"
                    aria-label={T.archive}
                    title={T.archive}
                    onClick={() => void archive(node)}
                  >
                    <Archive aria-hidden />
                  </Button>
                </>
              )}
            </span>
          ) : null}
        </div>
        {canManage && editing === 'edit' ? (
          <NodeEditor
            key={node.id}
            projectId={projectId}
            node={node}
            nodes={allNodes}
            folder={folderByLocation.get(node.id) ?? null}
            anchorFolder={anchorFolderOf(node.id)}
            placementTree={placementTree}
            actions={actions}
            folderTools={folderTools}
            onDone={done}
          />
        ) : null}
        {canManage && editing === 'add' ? (
          <AddChildForm projectId={projectId} parent={node} nodes={allNodes} actions={actions} onDone={done} />
        ) : null}
        {!path && isOpen ? renderChildren(node.id, depth + 1) : null}
      </li>
    );
  }

  function renderChildren(parentId: string | null, depth: number): ReactNode {
    const children = index.childrenOf.get(parentId) ?? [];
    if (children.length === 0) return null;
    const limit = limits[parentId ?? 'root'] ?? PAGE;
    return (
      <ul className="flex min-w-0 flex-col gap-0.5">
        {children.slice(0, limit).map((child) => renderNode(child, depth))}
        {children.length > limit ? (
          <li>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLimits((current) => ({ ...current, [parentId ?? 'root']: limit + PAGE }))}
            >
              {T.showMore.replace('{n}', String(children.length - limit))}
            </Button>
          </li>
        ) : null}
      </ul>
    );
  }

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return null;
    const found: { node: LocationNode; path: string }[] = [];
    for (const node of nodes) {
      const names = locationPath(index, node.id).map((item) => item.name);
      const path = names.slice(0, -1).join(' › ');
      const haystack = `${names.join(' ')} ${node.code ?? ''}`.toLocaleLowerCase();
      if (haystack.includes(needle)) found.push({ node, path });
      if (found.length >= SEARCH_LIMIT) break;
    }
    return found;
  }, [query, nodes, index]);

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="infra-locations-panel">
      {!canManage ? <Alert tone="info">{T.noPermission}</Alert> : null}
      {canManage && !storageConnected ? (
        <Alert tone="info" data-testid="infra-needs-cloud">
          {T.needsCloud}
        </Alert>
      ) : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

      {canManage ? (
        wizardOpen ? (
          <StructureWizard
            projectId={projectId}
            parentId={null}
            createStructure={infraCreateStructureAction}
            onCancel={() => setWizardOpen(false)}
            onCreated={(count) => {
              setWizardOpen(false);
              setMessage({ tone: 'success', text: `${T.createdToast} (${count})` });
              onChanged();
            }}
          />
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" onClick={() => setWizardOpen(true)} data-testid="open-structure-wizard">
              <Layers aria-hidden />
              {'הגדרת מבנה'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPanel({ kind: 'add', id: null })}>
              <Plus aria-hidden />
              {T.addRoot}
            </Button>
          </div>
        )
      ) : null}

      {canManage && panel?.kind === 'add' && panel.id === null ? (
        <AddChildForm projectId={projectId} parent={null} nodes={allNodes} actions={actions} onDone={done} />
      ) : null}

      <section className="flex min-w-0 flex-col gap-3" aria-label={T.title}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">
            {T.title} <span className="text-xs font-normal text-[var(--pf-text-secondary)]">({activeCount})</span>
          </h3>
          <label className="flex min-h-11 items-center gap-2" htmlFor="locations-show-archived">
            <Checkbox id="locations-show-archived" checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
            <span className="text-sm">{T.showArchived}</span>
          </label>
        </div>
        {allNodes.length > 8 ? (
          <label className="relative block min-w-0" htmlFor="locations-search">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pf-text-muted)]" aria-hidden />
            <Input
              id="locations-search"
              className="ps-9"
              value={query}
              placeholder={T.search}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}

        {nodes.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--pf-border-default)] p-4 text-sm text-[var(--pf-text-secondary)]">{T.empty}</p>
        ) : results ? (
          results.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{T.noResults}</p>
          ) : (
            <>
              <p className="text-xs text-[var(--pf-text-secondary)]">{T.searchResults.replace('{n}', String(results.length))}</p>
              <ul className="flex min-w-0 flex-col gap-0.5">{results.map(({ node, path }) => renderNode(node, 0, path || '—'))}</ul>
            </>
          )
        ) : (
          <nav aria-label={T.title}>{renderChildren(null, 0)}</nav>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3" data-testid="infra-cloud-summary">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {missingCount + repairable > 0 ? <CloudOff className="size-4 text-[var(--pf-status-danger-fg)]" aria-hidden /> : <Cloud className="size-4" aria-hidden />}
          {T.cloudSummaryTitle}
        </h3>
        <p className="text-xs text-[var(--pf-text-secondary)]">{T.cloudIntro}</p>
        <p className="text-sm">{readyCount > 0 ? T.cloudSummary.replace('{n}', String(readyCount)) : T.cloudSummaryNone}</p>
        {rootFolder ? <p className="text-xs text-[var(--pf-text-secondary)]">{rootFolder.displayName}</p> : null}
        {canManage && (repairable > 0 || missingCount > 0) ? (
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-medium text-[var(--pf-status-danger-fg)]">
              {T.repairTitle}: {repairable + missingCount}
            </p>
            {repairable > 0 ? (
              <Button type="button" variant="secondary" className="self-start" onClick={() => void repair()} loading={repairing} data-testid="infra-sync-folders">
                <Wrench aria-hidden />
                {repairing ? T.repairing : T.repair}
              </Button>
            ) : null}
            {missingCount > 0 ? <p className="text-xs">{T.folderMissing}</p> : null}
          </div>
        ) : null}
        {canManage && browserActions ? (
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setLinkTarget({ locationId: null })}>
            <Link2 aria-hidden />
            {T.linkRoot}
          </Button>
        ) : null}
      </section>

      {browserActions && linkTarget ? (
        <InfraFolderPicker
          projectId={projectId}
          open
          onOpenChange={(open) => !open && setLinkTarget(null)}
          browserActions={browserActions}
          onSelect={linkFolder}
        />
      ) : null}
    </div>
  );
}

export { isLevelType };

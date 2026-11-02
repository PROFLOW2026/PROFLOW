'use client';

import { CheckCircle2, FolderSync, Link2, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import { LOCATION_TYPES, type LocationNode, type LocationType } from '@/modules/project-profile/domain/locations';
import { LocationsCard } from '@/modules/project-profile/ui/locations-card';
import type { ProjectStructureActions, StructureActionResult } from '@/modules/project-profile/ui/types';
import {
  infraArchiveLocationAction,
  infraCreateLocationAction,
  infraGenerateLocationsAction,
  infraMoveLocationAction,
  infraRestoreLocationAction,
  infraUpdateLocationAction,
  linkInfraFolderAction,
  syncInfraFoldersAction,
} from '../actions';
import type { InfraFolderStatusDto, InfraLocationOption } from '../domain/types';
import { InfraFolderPicker } from './infra-folder-picker';
import { flattenLocations } from './infra-location-select';
import { INFRA_TEXT } from './texts';

const MAX_SYNC_ROUNDS = 80;

function toLocationNode(node: InfraLocationOption): LocationNode {
  const type = (LOCATION_TYPES as readonly string[]).includes(node.type) ? (node.type as LocationType) : 'area';
  return { ...node, type };
}

/**
 * "מיקומים ותיקיות": the free-form location tree (reusing the project structure editor, incl.
 * bulk generation of floors / apartments / areas) plus the real cloud folder for every location.
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
  /** False when the organization has no active cloud connection: new locations cannot be added. */
  readonly storageConnected?: boolean;
  /** Storage browser (only for viewers allowed to browse the connected storage). */
  readonly browserActions?: ProjectCloudFileBrowserActions;
  readonly onChanged: () => void;
}) {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ locationId: string | null } | null>(null);

  const nodes = useMemo(() => locations.map(toLocationNode), [locations]);
  const flat = useMemo(() => flattenLocations(locations), [locations]);
  const folderByLocation = useMemo(() => {
    const map = new Map<string, InfraFolderStatusDto>();
    for (const folder of folders) if (folder.locationId) map.set(folder.locationId, folder);
    return map;
  }, [folders]);
  const rootFolder = folders.find((folder) => folder.locationId === null) ?? null;
  const readyCount = flat.filter((item) => folderByLocation.get(item.id)?.status === 'ready').length;
  const missingCount = flat.length - readyCount;

  const wrap = (action: (payload: never) => Promise<StructureActionResult>) => async (payload: never) => {
    const result = await action(payload);
    if (result.ok) onChanged();
    return result;
  };

  const actions: Pick<
    ProjectStructureActions,
    'createLocation' | 'updateLocation' | 'moveLocation' | 'archiveLocation' | 'restoreLocation' | 'generateLocations'
  > = {
    createLocation: wrap(infraCreateLocationAction as never) as ProjectStructureActions['createLocation'],
    updateLocation: wrap(infraUpdateLocationAction as never) as ProjectStructureActions['updateLocation'],
    moveLocation: wrap(infraMoveLocationAction as never) as ProjectStructureActions['moveLocation'],
    archiveLocation: wrap(infraArchiveLocationAction as never) as ProjectStructureActions['archiveLocation'],
    restoreLocation: wrap(infraRestoreLocationAction as never) as ProjectStructureActions['restoreLocation'],
    // Bulk creation behaves like single creation: the cloud folders of the new locations are created right away.
    generateLocations: (async (payload: never) => {
      const result = await infraGenerateLocationsAction(payload);
      if (result.ok) {
        onChanged();
        void syncAll('afterCreate');
      }
      return result;
    }) as ProjectStructureActions['generateLocations'],
  };

  async function syncAll(mode: 'repair' | 'afterCreate' = 'repair') {
    const failedText = mode === 'afterCreate' ? INFRA_TEXT.locations.syncAfterCreateFailed : INFRA_TEXT.locations.syncFailed;
    setSyncing(true);
    setMessage(mode === 'afterCreate' ? { tone: 'info', text: INFRA_TEXT.locations.syncAfterCreate } : null);
    let previous = Number.POSITIVE_INFINITY;
    try {
      for (let round = 0; round < MAX_SYNC_ROUNDS; round += 1) {
        const result = await syncInfraFoldersAction({ projectId });
        if (!result.ok) {
          setMessage({ tone: 'danger', text: result.error });
          return;
        }
        const { remaining, failed } = result.data;
        if (remaining === 0) {
          setMessage({ tone: 'success', text: INFRA_TEXT.locations.syncDone });
          return;
        }
        if (remaining >= previous && failed.length > 0) {
          setMessage({ tone: 'danger', text: failedText });
          return;
        }
        previous = remaining;
        setMessage({ tone: 'info', text: INFRA_TEXT.locations.syncProgress.replace('{n}', String(remaining)) });
      }
      setMessage({ tone: 'danger', text: failedText });
    } finally {
      setSyncing(false);
      onChanged();
    }
  }

  async function linkFolder(folder: { id: string; name: string }) {
    if (!linkTarget) return;
    const result = await linkInfraFolderAction({
      projectId,
      locationId: linkTarget.locationId,
      externalFolderId: folder.id,
    });
    if (!result.ok) {
      setMessage({ tone: 'danger', text: result.error });
      return;
    }
    setMessage({ tone: 'success', text: INFRA_TEXT.locations.linked });
    onChanged();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="infra-locations-panel">
      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h3 className="text-base font-semibold">{INFRA_TEXT.locations.foldersTitle}</h3>
        <p className="text-sm text-[var(--pf-text-secondary)]">{INFRA_TEXT.locations.foldersIntro}</p>
        {!canManage ? <Alert tone="info">{INFRA_TEXT.locations.noPermission}</Alert> : null}
        {canManage && !storageConnected ? (
          <Alert tone="danger" data-testid="infra-needs-cloud">
            {INFRA_TEXT.locations.needsCloud}
          </Alert>
        ) : null}
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void syncAll()} disabled={syncing || missingCount === 0} data-testid="infra-sync-folders">
              {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <FolderSync aria-hidden />}
              {syncing ? INFRA_TEXT.locations.syncing : INFRA_TEXT.locations.sync}
            </Button>
            {browserActions ? (
              <Button type="button" variant="secondary" onClick={() => setLinkTarget({ locationId: null })}>
                <Link2 aria-hidden />
                {INFRA_TEXT.locations.linkRoot}
              </Button>
            ) : null}
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {INFRA_TEXT.locations.ready}: {readyCount}/{flat.length}
            </span>
          </div>
        ) : null}
        {canManage && flat.length > 0 && missingCount === 0 && !message ? (
          <p className="text-xs text-[var(--pf-text-secondary)]">{INFRA_TEXT.locations.syncNothing}</p>
        ) : null}
        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
        {rootFolder ? (
          <p className="text-xs text-[var(--pf-text-secondary)]">
            {rootFolder.displayName} · {rootFolder.origin === 'linked_existing' ? INFRA_TEXT.locations.linkedExisting : INFRA_TEXT.locations.autoFolder}
          </p>
        ) : null}
        {flat.length > 0 ? (
          <ul className="flex max-h-72 min-w-0 flex-col divide-y divide-[var(--pf-border-default)] overflow-y-auto rounded-md border border-[var(--pf-border-default)]">
            {flat.map((item) => {
              const folder = folderByLocation.get(item.id);
              const status = folder?.status ?? 'pending';
              return (
                <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2 text-sm" data-testid="infra-folder-row" data-status={status}>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-xs ${status === 'ready' ? 'text-[var(--pf-status-success-fg)]' : status === 'error' ? 'text-[var(--pf-status-danger-fg)]' : 'text-[var(--pf-text-secondary)]'}`}
                    title={folder?.lastError ?? undefined}
                  >
                    {status === 'ready' ? <CheckCircle2 className="size-3.5" aria-hidden /> : null}
                    {status === 'ready' ? (folder?.origin === 'linked_existing' ? INFRA_TEXT.locations.linkedExisting : INFRA_TEXT.locations.ready) : status === 'error' ? INFRA_TEXT.locations.error : INFRA_TEXT.locations.pending}
                  </span>
                  {canManage && browserActions ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLinkTarget({ locationId: item.id })}>
                      <Link2 aria-hidden />
                      {INFRA_TEXT.locations.link}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <LocationsCard projectId={projectId} locations={nodes} canEdit={canManage} actions={actions} />

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

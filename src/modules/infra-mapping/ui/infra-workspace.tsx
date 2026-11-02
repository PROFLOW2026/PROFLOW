'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProjectCloudFileBrowserActions } from '@/modules/external-storage/client/project-cloud-file-picker-types';
import type { InfraTrialPreset } from '@/modules/project-workspace/ui/infra-trial-integration';
import { loadDescriptorSuggestionsAction, loadInfraWorkspaceAction, type InfraWorkspaceData } from '../actions';
import type { InfraCaptureDto, InfraType, InfraViewer } from '../domain/types';
import type { LocateSlot } from './infra-capture-dialog';
import { InfraCapturePanel } from './infra-capture-panel';
import { evidenceFileUrl } from './infra-client';
import { InfraGallery } from './infra-gallery';
import { InfraLocatePanel } from './infra-locate-panel';
import { InfraLocationsPanel } from './infra-locations-panel';
import { ProjectStoragePickButton } from './infra-storage-pick-button';
import { INFRA_TEXT } from './texts';
import { useInfraUploads } from './use-infra-uploads';

export type InfraTab = 'capture' | 'gallery' | 'locate' | 'locations';

export interface InfraWorkspaceProps {
  readonly viewer: InfraViewer;
  readonly projectId: string;
  /** Contractors / employees work for the owning organization; internal users omit it. */
  readonly organizationId?: string | null;
  /** Start documenting from an existing task (links every capture to it). */
  readonly taskId?: string | null;
  readonly initialTab?: InfraTab;
  /** Connected-storage browser; only wired for surfaces whose users may browse project files. */
  readonly browserActions?: ProjectCloudFileBrowserActions;
}

/** Loads the authorised workspace snapshot; every piece of data below comes from it. */
export function InfraWorkspace(props: InfraWorkspaceProps) {
  const { viewer, projectId, organizationId, taskId } = props;
  const [data, setData] = useState<InfraWorkspaceData | null>(null);
  const [error, setError] = useState<{ text: string; dbPending: boolean } | null>(null);
  const [suggestions, setSuggestions] = useState<{ rooms: string[]; walls: string[] }>({ rooms: [], walls: [] });

  const load = useCallback(async () => {
    const result = await loadInfraWorkspaceAction({ viewer, projectId, organizationId, taskId });
    if (!result.ok) {
      setError({ text: result.error, dbPending: Boolean(result.dbPending) });
      return;
    }
    setError(null);
    setData(result.data);
    const hints = await loadDescriptorSuggestionsAction(viewer, { projectId, organizationId: result.data.organizationId });
    if (hints.ok) setSuggestions(hints.data);
  }, [viewer, projectId, organizationId, taskId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void load();
  }, [load]);

  if (error && !data) {
    return (
      <div className="flex max-w-2xl flex-col gap-3" data-testid="infra-workspace-error" data-db-pending={error.dbPending}>
        <Alert tone={error.dbPending ? 'warning' : 'danger'}>{error.text}</Alert>
        {!error.dbPending ? (
          <Button type="button" variant="secondary" className="w-fit" onClick={() => void load()}>
            {INFRA_TEXT.retry}
          </Button>
        ) : null}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={INFRA_TEXT.loading}>
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }
  return <InfraWorkspaceLoaded {...props} data={data} suggestions={suggestions} reload={load} />;
}

function InfraWorkspaceLoaded({
  viewer,
  projectId,
  taskId,
  initialTab,
  browserActions,
  data,
  suggestions,
  reload,
}: InfraWorkspaceProps & {
  readonly data: InfraWorkspaceData;
  readonly suggestions: { rooms: string[]; walls: string[] };
  readonly reload: () => Promise<void>;
}) {
  const { organizationId, permissions } = data;
  const [tab, setTab] = useState<InfraTab>(initialTab ?? 'capture');
  const [locationId, setLocationId] = useState<string | null>(() => {
    // With a single location there is nothing to choose: start on it.
    const usable = data.locations.filter((node) => !node.archived && node.isActive);
    return usable.length === 1 ? usable[0]!.id : null;
  });
  // The business profile pre-selects a work domain; the user can change it any time (never locked).
  const [workDomain, setWorkDomain] = useState<InfraType | null>(data.defaultWorkDomain ?? null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [preset, setPreset] = useState<InfraTrialPreset | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const activeStorage = permissions.canBrowseStorage ? browserActions : undefined;

  const uploads = useInfraUploads({
    viewer,
    projectId,
    organizationId,
    taskId: taskId ?? null,
    onUploaded: () => setRefreshKey((value) => value + 1),
  });

  const locationsReady = data.locations.some((node) => !node.archived && node.isActive);
  const onTab = (next: string) => {
    setTab(next as InfraTab);
    if (next !== 'locate') setPreset(null);
  };

  /**
   * A frame taken from a video enters the same hand-off as any other photo. It is not a catalogued
   * capture (no captureId) and is not saved anywhere unless the user later saves a comparison.
   */
  function openVideoFrameInLocate(frame: File, slot: LocateSlot) {
    setSelectError(null);
    setPreset({
      key: Date.now(),
      target: slot === 'live' ? 'live-before' : slot === 'after' ? 'two-after' : 'two-before',
      photo: { file: frame },
    });
    setTab('locate');
  }

  async function selectForLocate(capture: InfraCaptureDto, slot: LocateSlot) {
    setSelectError(null);
    try {
      const response = await fetch(evidenceFileUrl(viewer, capture.evidenceId), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('download');
      const blob = await response.blob();
      const file = new File([blob], capture.fileName, { type: blob.type || capture.mimeType });
      setPreset({
        key: Date.now(),
        target: slot === 'live' ? 'live-before' : slot === 'after' ? 'two-after' : 'two-before',
        photo: { file, captureId: capture.id },
      });
      setTab('locate');
    } catch {
      setSelectError(INFRA_TEXT.gallery.selectFailed);
    }
  }

  return (
    <div className="flex min-w-0 max-w-3xl flex-col gap-3" data-testid="infra-workspace" data-viewer={viewer}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{INFRA_TEXT.title}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{INFRA_TEXT.intro}</p>
        {data.task ? (
          <p className="text-sm">
            {INFRA_TEXT.task}: <span className="font-medium">{data.task.title}</span>
          </p>
        ) : null}
      </div>

      {!locationsReady && !permissions.canManageLocations ? <Alert tone="info">{INFRA_TEXT.noLocations}</Alert> : null}
      {selectError ? <Alert tone="danger">{selectError}</Alert> : null}

      <Tabs value={tab} onValueChange={onTab}>
        <TabsList>
          <TabsTrigger value="capture" data-testid="infra-tab-capture">
            {INFRA_TEXT.tabs.capture}
          </TabsTrigger>
          <TabsTrigger value="gallery" data-testid="infra-tab-gallery">
            {INFRA_TEXT.tabs.gallery}
          </TabsTrigger>
          <TabsTrigger value="locate" data-testid="infra-tab-locate">
            {INFRA_TEXT.tabs.locate}
          </TabsTrigger>
          {permissions.canManageLocations ? (
            <TabsTrigger value="locations" data-testid="infra-tab-locations">
              {INFRA_TEXT.tabs.locations}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="capture">
          {locationsReady ? (
            <InfraCapturePanel
              locations={data.locations}
              locationId={locationId}
              onLocationChange={setLocationId}
              workDomain={workDomain}
              onWorkDomainChange={setWorkDomain}
              uploads={uploads}
              suggestions={suggestions}
              taskTitle={data.task?.title ?? null}
              canDocument={permissions.canDocument}
              canCaptureVideo={permissions.canCaptureVideo}
              storagePicker={
                activeStorage
                  ? (onFile) => <ProjectStoragePickButton projectId={projectId} browserActions={activeStorage} onFile={onFile} />
                  : undefined
              }
            />
          ) : (
            <Alert tone="info">{INFRA_TEXT.noLocations}</Alert>
          )}
        </TabsContent>

        <TabsContent value="gallery">
          <InfraGallery
            viewer={viewer}
            projectId={projectId}
            organizationId={organizationId}
            locations={data.locations}
            permissions={permissions}
            suggestions={suggestions}
            refreshKey={refreshKey}
            initialLocationId={null}
            allowCloudLink={viewer === 'internal' && permissions.canBrowseStorage}
            onSelectForLocate={(capture, slot) => void selectForLocate(capture, slot)}
            onUseVideoFrame={(frame, slot) => openVideoFrameInLocate(frame, slot)}
          />
        </TabsContent>

        <TabsContent value="locate">
          <InfraLocatePanel
            viewer={viewer}
            projectId={projectId}
            organizationId={organizationId}
            taskId={taskId ?? null}
            locations={data.locations}
            defaultLocationId={locationId}
            canDocument={permissions.canDocument}
            canManageCaptures={permissions.canManageCaptures}
            browserActions={activeStorage}
            preset={preset}
            onSaved={() => setRefreshKey((value) => value + 1)}
          />
        </TabsContent>

        {permissions.canManageLocations ? (
          <TabsContent value="locations">
            <InfraLocationsPanel
              projectId={projectId}
              locations={data.locations}
              folders={data.folders}
              canManage={permissions.canManageLocations}
              storageConnected={data.storageConnected !== false}
              browserActions={activeStorage}
              onChanged={() => void reload()}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}


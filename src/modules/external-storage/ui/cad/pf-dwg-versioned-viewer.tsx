'use client';

import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { Alert } from '@/components/ui/alert';
import type { ProviderFileItem } from '@/modules/external-storage/domain/types';
import type { StorageBrowserScope } from '@/modules/external-storage/client/storage-file-urls';
import type { CadIndexedFile } from './pf-cad/xref-resolver';
import { DEFAULT_CAD_VIEWER_VERSION, type CadViewerVersion } from './cad-viewer-version-select';
import { cadViewerTree } from './cad-viewer-engines';

type ViewerProps = {
  url: string;
  fileName: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  siblingFiles?: readonly ProviderFileItem[];
  scope: StorageBrowserScope;
  projectId?: string;
  devCadIndexedFiles?: readonly CadIndexedFile[];
  wasmBaseUrl?: string;
  hostLogicalId?: string;
  xrefChoices?: readonly { parentLogicalId: string; blockName: string; savedPath: string; logicalId: string }[];
  onXrefReport?: (rows: readonly { blockName: string; savedPath: string }[]) => void;
  viewerVersion: CadViewerVersion;
  onViewerVersionChange: (version: CadViewerVersion) => void;
};

const LOADERS: Record<CadViewerVersion, () => Promise<{ PfDwgViewer: ComponentType<ViewerProps> }>> = {
  v1: () => import('./pf-cad-v3/pf-dwg-viewer'),
  v2: () => import('./pf-cad/pf-dwg-viewer'),
  v3: () => import('./pf-cad-v1/pf-dwg-viewer'),
};

export function PfDwgVersionedViewer(props: Omit<ViewerProps, 'viewerVersion' | 'onViewerVersionChange'>) {
  const [requested, setRequested] = useState<CadViewerVersion>(DEFAULT_CAD_VIEWER_VERSION);
  const [active, setActive] = useState<{
    version: CadViewerVersion;
    Viewer: ComponentType<ViewerProps>;
  } | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void LOADERS[requested]()
      .then((mod) => {
        if (cancelled) return;
        setActive({ version: requested, Viewer: mod.PfDwgViewer });
        setSwitchError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSwitchError('לא ניתן לטעון את הגרסה שנבחרה.');
        setRequested((current) => (current === requested ? DEFAULT_CAD_VIEWER_VERSION : current));
      });
    return () => {
      cancelled = true;
    };
  }, [requested]);

  const Viewer = active?.Viewer;
  const shownFiles =
    active?.version === 'v3' && props.devCadIndexedFiles
      ? props.devCadIndexedFiles.filter((file) => {
          const base = (file.name.split(/[\\/]/).pop() ?? file.name).toLowerCase();
          const same = props.devCadIndexedFiles?.filter(
            (other) => (other.name.split(/[\\/]/).pop() ?? other.name).toLowerCase() === base,
          ).length;
          return same === 1;
        })
      : props.devCadIndexedFiles;

  return (
    <div data-pf-style="classic" data-cad-tree={cadViewerTree(active?.version ?? requested)} className="flex min-h-0 flex-1 flex-col">
      {switchError ? (
        <Alert tone="danger" className="m-2">
          {switchError}
        </Alert>
      ) : null}
      {Viewer && active ? (
        <Viewer
          key={active.version}
          {...props}
          devCadIndexedFiles={shownFiles}
          wasmBaseUrl={active.version === 'v3' ? undefined : props.wasmBaseUrl}
          hostLogicalId={active.version === 'v3' ? undefined : props.hostLogicalId}
          xrefChoices={active.version === 'v3' ? undefined : props.xrefChoices}
          onXrefReport={props.onXrefReport}
          viewerVersion={active.version}
          onViewerVersionChange={setRequested}
        />
      ) : null}
    </div>
  );
}

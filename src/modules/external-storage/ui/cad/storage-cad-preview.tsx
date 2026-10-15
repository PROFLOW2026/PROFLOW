'use client';

import type { ProviderFileItem } from '@/modules/external-storage/domain/types';
import type { StorageBrowserScope } from '@/modules/external-storage/client/storage-file-urls';
import type { CadPreviewKind } from '@/modules/documents/domain/cad-file-rules';
import { AutodeskDwfViewer } from './autodesk-dwf-viewer';
import { MlightcadDxfViewer } from './mlightcad-dxf-viewer';
import { PfDwgViewer } from './pf-cad/pf-dwg-viewer';

export function StorageCadPreview({
  kind,
  url,
  fileName,
  reloadKey,
  onRetry,
  onOpenOnDevice,
  siblingFiles,
  scope,
  projectId,
}: {
  kind: CadPreviewKind;
  url: string;
  fileName: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  siblingFiles?: readonly ProviderFileItem[];
  scope: StorageBrowserScope;
  projectId?: string;
}) {
  if (kind === 'dwg') {
    return (
      <PfDwgViewer
        url={url}
        fileName={fileName}
        reloadKey={reloadKey}
        onRetry={onRetry}
        onOpenOnDevice={onOpenOnDevice}
        siblingFiles={siblingFiles}
        scope={scope}
        projectId={projectId}
      />
    );
  }
  if (kind === 'dxf') {
    return (
      <MlightcadDxfViewer
        url={url}
        fileName={fileName}
        reloadKey={reloadKey}
        onRetry={onRetry}
        onOpenOnDevice={onOpenOnDevice}
      />
    );
  }
  return (
    <AutodeskDwfViewer
      url={url}
      fileExtension={kind === 'dwfx' ? 'dwfx' : 'dwf'}
      reloadKey={reloadKey}
      onRetry={onRetry}
      onOpenOnDevice={onOpenOnDevice}
    />
  );
}

'use client';

import type { CadPreviewKind } from '@/modules/documents/domain/cad-file-rules';
import { AutodeskDwfViewer } from './autodesk-dwf-viewer';
import { CodecadDwgViewer } from './codecad-dwg-viewer';
import { MlightcadDxfViewer } from './mlightcad-dxf-viewer';

export function StorageCadPreview({
  kind,
  url,
  fileName,
  reloadKey,
  onRetry,
  onOpenOnDevice,
}: {
  kind: CadPreviewKind;
  url: string;
  fileName: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
}) {
  if (kind === 'dwg') {
    return (
      <CodecadDwgViewer
        url={url}
        reloadKey={reloadKey}
        onRetry={onRetry}
        onOpenOnDevice={onOpenOnDevice}
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

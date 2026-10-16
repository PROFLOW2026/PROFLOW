import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hiddenRasterLayersFromUi } from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-layers';
import { cadRasterMimeFromPath } from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-mime';
import {
  type CadRasterWebGlPass,
  P9_RASTER_WEBGL_ENABLED,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-webgl';
import { cadLayersToUi, type UiLayer } from '@/modules/external-storage/ui/cad/pf-cad/cad-layers';
import type { ScenePayload } from '@/modules/external-storage/ui/cad/pf-cad/types';
import {
  buildFileIndex,
  lookupInIndex,
  normalizeCadPath,
  type FileIndex,
} from '@/modules/external-storage/ui/cad/pf-cad/xref-resolver';

export const P9_FIXTURE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Host path used with lookupInIndex (mirrors storage viewer layout). */
export const P9_HOST_PATH = 'storage/synthetic-p9/drawing.dwg';

export function loadP9Scene(): ScenePayload {
  const raw = readFileSync(path.join(P9_FIXTURE_DIR, 'scene.json'), 'utf8');
  return JSON.parse(raw) as ScenePayload;
}

export function readP9RasterBytes(): Uint8Array {
  return new Uint8Array(readFileSync(path.join(P9_FIXTURE_DIR, 'p9-raster-tile.png')));
}

export function buildP9DevFileIndex(): FileIndex {
  const bytes = readP9RasterBytes();
  return buildFileIndex([
    {
      name: `${P9_FIXTURE_DIR.replace(/\\/g, '/')}/p9-raster-tile.png`,
      getBytes: async () => bytes,
    },
  ]);
}

export function p9UiLayers(scene: ScenePayload): UiLayer[] {
  return cadLayersToUi(scene.layers);
}

/** Same blob URL resolution as pf-dwg-viewer syncRasterScene. */
export function createP9RasterResolveUrl(
  fileIndex: FileIndex,
  hostPath: string,
): (imagePath: string) => Promise<string | null> {
  const host = normalizeCadPath(hostPath);
  return async (imagePath: string) => {
    const hit = lookupInIndex(fileIndex, host, imagePath);
    if (!hit) return null;
    try {
      const bytes = await hit.getBytes();
      const blob = new Blob([Uint8Array.from(bytes)], {
        type: cadRasterMimeFromPath(imagePath),
      });
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  };
}

/** Viewer syncRasterScene → CadRasterWebGlPass (release + setScene). */
export function syncP9RasterScene(
  pass: CadRasterWebGlPass,
  gl: WebGL2RenderingContext,
  scene: ScenePayload,
  layers: readonly UiLayer[],
  fileIndex: FileIndex,
  hostPath: string = P9_HOST_PATH,
): void {
  if (!P9_RASTER_WEBGL_ENABLED) return;
  pass.init(gl);
  pass.releaseSceneTextures(gl);
  pass.setScene(
    scene.images,
    scene.origin,
    hiddenRasterLayersFromUi(layers),
    createP9RasterResolveUrl(fileIndex, hostPath),
  );
}

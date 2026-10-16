import type { UiLayer } from './cad-layers';

/** Layer indices hidden from raster draw (off, frozen, or toggled off). */
export function hiddenRasterLayersFromUi(layers: readonly UiLayer[]): Set<number> {
  const hidden = new Set<number>();
  for (const layer of layers) {
    if (!layer.visible || layer.frozen) hidden.add(layer.index);
  }
  return hidden;
}

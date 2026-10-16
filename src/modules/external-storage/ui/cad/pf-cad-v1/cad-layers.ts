import type { CadLayer } from './types';

export type UiLayer = {
  id: string;
  index: number;
  name: string;
  visible: boolean;
  frozen: boolean;
};

export function cadLayersToUi(layers: CadLayer[]): UiLayer[] {
  return layers.map((layer) => ({
    id: String(layer.i),
    index: layer.i,
    name: layer.name,
    visible: !layer.off && !layer.frozen,
    frozen: layer.frozen,
  }));
}

export function applyUiLayerVisibility(
  layers: CadLayer[],
  layerIndex: number,
  visible: boolean,
): CadLayer[] {
  return layers.map((layer) => {
    if (layer.i !== layerIndex) return layer;
    if (layer.frozen) return layer;
    return { ...layer, off: !visible };
  });
}

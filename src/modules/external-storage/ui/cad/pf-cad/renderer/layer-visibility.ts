export type LayerVisibilityInput = Uint8Array | ReadonlySet<number> | null | undefined;

export type LayerVisibilityState =
  | { mode: 'all' }
  | { mode: 'mask'; mask: Uint8Array }
  | { mode: 'set'; visible: ReadonlySet<number> };

export function normalizeLayerVisibility(input: LayerVisibilityInput): LayerVisibilityState {
  if (input == null) {
    return { mode: 'all' };
  }
  if (input instanceof Uint8Array) {
    return { mode: 'mask', mask: input };
  }
  return { mode: 'set', visible: input };
}

export function isLayerVisible(state: LayerVisibilityState, layerIndex: number): boolean {
  if (layerIndex < 0) {
    return false;
  }
  switch (state.mode) {
    case 'all':
      return true;
    case 'set':
      return state.visible.has(layerIndex);
    case 'mask':
      return layerIndex < state.mask.length ? state.mask[layerIndex] !== 0 : false;
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

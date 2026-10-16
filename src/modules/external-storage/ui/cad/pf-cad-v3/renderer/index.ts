export { CadWebGlRenderer, GL_RESOURCES_LOST_MESSAGE } from './cad-webgl-renderer';
export type { CadWebGlRendererOptions } from './cad-webgl-renderer';

export {
  SEGMENT_STRIDE,
  colorBitsFromSegmentFloat,
  colorBitsToRgb01,
  layerIndexFromSegment,
  segmentCount,
} from './segment-format';
export type { CadExtent } from './segment-format';

export { buildColorLineBatches } from './segment-batch';
export type { ColorLineBatch, SegmentBatchResult } from './segment-batch';

export { isLayerVisible, normalizeLayerVisibility } from './layer-visibility';
export type { LayerVisibilityInput, LayerVisibilityState } from './layer-visibility';

export {
  clampZoom,
  computeFitView,
  screenToWorld,
  worldToScreen,
  zoomAtScreenPoint,
} from './view-math';
export type { CadView, ViewportSize } from './view-math';

import {
  CadWebGlRenderer,
  clampZoom,
  zoomAtScreenPoint,
  type CadExtent,
  type CadView,
} from './renderer';
import type { UiLayer } from './cad-layers';

export type CadRendererHandle = {
  dispose: () => void;
  resize: (width: number, height: number, dpr: number) => void;
  setDrawing: (segments: Float32Array, extent: CadExtent) => void;
  setDrawingAsync: (
    segments: Float32Array,
    extent: CadExtent,
    layers?: readonly UiLayer[],
    fullExtent?: CadExtent,
  ) => Promise<void>;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  applyLayerVisibility: (layers: readonly UiLayer[]) => void;
  /** Fit to main content extent (default on load). */
  fit: () => void;
  /** Fit entire drawing including distant geometry. */
  fitFull: () => void;
  zoom: (factor: number) => void;
  zoomAt: (sx: number, sy: number, factor: number) => void;
  panBy: (dxPx: number, dyPx: number) => void;
  getView: () => CadView;
  draw: () => void;
  getRenderer: () => CadWebGlRenderer;
};

export type CreateCadRendererOptions = {
  canvas: HTMLCanvasElement;
  onContextLost?: () => void;
  /** Called after view-changing draw (pan/zoom/fit/resize) for overlay sync. */
  onAfterViewChange?: () => void;
};

export function createCadRenderer(options: CreateCadRendererOptions): CadRendererHandle {
  const renderer = new CadWebGlRenderer(options.canvas, {
    onContextLost: options.onContextLost,
  });
  const notifyViewChange = () => options.onAfterViewChange?.();
  let extent: CadExtent | null = null;
  let fullExtent: CadExtent | null = null;
  const visibleLayers = new Set<number>();

  const syncLayerMask = () => {
    renderer.setLayerVisibility(visibleLayers.size > 0 ? visibleLayers : null);
  };

  return {
    dispose: () => renderer.destroy(),
    resize: (width, height, dpr) => {
      options.canvas.width = Math.max(1, Math.floor(width * dpr));
      options.canvas.height = Math.max(1, Math.floor(height * dpr));
      options.canvas.style.width = `${width}px`;
      options.canvas.style.height = `${height}px`;
      renderer.resize(options.canvas.width, options.canvas.height);
      renderer.draw();
      notifyViewChange();
    },
    setDrawing: (segments, ext) => {
      extent = ext;
      renderer.setSegments(segments);
      renderer.fitExtent(ext);
      renderer.draw();
    },
    setDrawingAsync: async (segments, ext, layers, fullExt) => {
      extent = ext;
      fullExtent = fullExt ?? ext;
      if (layers) {
        visibleLayers.clear();
        for (const layer of layers) {
          if (layer.visible && !layer.frozen) {
            visibleLayers.add(layer.index);
          }
        }
        renderer.prepareLayerVisibility(visibleLayers.size > 0 ? visibleLayers : null);
      }
      await renderer.setSegmentsAsync(segments);
      renderer.fitExtent(ext);
      renderer.draw();
    },
    setLayerVisibility: (layerId, visible) => {
      const idx = Number(layerId);
      if (Number.isNaN(idx)) return;
      if (visible) visibleLayers.add(idx);
      else visibleLayers.delete(idx);
      syncLayerMask();
      renderer.draw();
    },
    applyLayerVisibility: (layers) => {
      visibleLayers.clear();
      for (const layer of layers) {
        if (layer.visible && !layer.frozen) {
          visibleLayers.add(layer.index);
        }
      }
      syncLayerMask();
      renderer.draw();
    },
    fit: () => {
      if (extent) {
        renderer.fitExtent(extent);
        renderer.draw();
        notifyViewChange();
      }
    },
    fitFull: () => {
      if (fullExtent) {
        renderer.fitExtent(fullExtent);
        renderer.draw();
        notifyViewChange();
      }
    },
    zoom: (factor) => {
      const v = renderer.getView();
      const viewport = renderer.getViewport();
      const next = zoomAtScreenPoint(v, viewport, viewport.width * 0.5, viewport.height * 0.5, factor);
      renderer.setView(next);
      renderer.draw();
      notifyViewChange();
    },
    zoomAt: (sx, sy, factor) => {
      const v = renderer.getView();
      const viewport = renderer.getViewport();
      renderer.setView(zoomAtScreenPoint(v, viewport, sx, sy, factor));
      renderer.draw();
      notifyViewChange();
    },
    panBy: (dxPx, dyPx) => {
      const v = renderer.getView();
      const z = clampZoom(v.zoom);
      renderer.setView({
        ...v,
        panX: v.panX - dxPx / z,
        panY: v.panY + dyPx / z,
      });
      renderer.draw();
      notifyViewChange();
    },
    draw: () => renderer.draw(),
    getView: () => renderer.getView(),
    getRenderer: () => renderer,
  };
}

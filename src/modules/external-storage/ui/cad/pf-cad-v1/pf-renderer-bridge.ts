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
  setDrawing: (segments: Float32Array, extent: CadExtent, triangles?: Float32Array) => void;
  setDrawingAsync: (
    segments: Float32Array,
    extent: CadExtent,
    layers?: readonly UiLayer[],
    fullExtent?: CadExtent,
    triangles?: Float32Array,
    segmentStride?: number,
  ) => Promise<void>;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
  applyLayerVisibility: (layers: readonly UiLayer[]) => void;
  /** Fit to main content extent (default on load). */
  fit: () => void;
  /** Fit entire drawing including distant geometry. */
  fitFull: () => void;
  zoom: (factor: number) => void;
  zoomAt: (sx: number, sy: number, factor: number) => void;
  /** Single draw path for pinch: pan then zoom about a screen point. */
  panAndZoomAt: (dxPx: number, dyPx: number, sx: number, sy: number, factor: number) => void;
  panBy: (dxPx: number, dyPx: number) => void;
  getView: () => CadView;
  draw: () => void;
  getRenderer: () => CadWebGlRenderer;
};

/** Overlay sync hint: zoom skips heavy work until idle; pan needs immediate follow. */
export type CadViewChangeKind = 'pan' | 'zoom' | 'fit';

export type CreateCadRendererOptions = {
  canvas: HTMLCanvasElement;
  onContextLost?: () => void;
  /** Called after view-changing draw (pan/zoom/fit/resize) for overlay sync. */
  onAfterViewChange?: (kind: CadViewChangeKind) => void;
};

export function createCadRenderer(options: CreateCadRendererOptions): CadRendererHandle {
  const renderer = new CadWebGlRenderer(options.canvas, {
    onContextLost: options.onContextLost,
  });
  const notifyViewChange = (kind: CadViewChangeKind) => options.onAfterViewChange?.(kind);
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
      notifyViewChange('fit');
    },
    setDrawing: (segments, ext, triangles = new Float32Array(0)) => {
      extent = ext;
      renderer.setSegments(segments, triangles);
      renderer.fitExtent(ext);
      renderer.draw();
    },
    setDrawingAsync: async (segments, ext, layers, fullExt, triangles = new Float32Array(0), segmentStride) => {
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
      await renderer.setSegmentsAsync(segments, triangles, segmentStride);
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
        notifyViewChange('fit');
      }
    },
    fitFull: () => {
      if (fullExtent) {
        renderer.fitExtent(fullExtent);
        renderer.draw();
        notifyViewChange('fit');
      }
    },
    zoom: (factor) => {
      const v = renderer.getView();
      const viewport = renderer.getViewport();
      const next = zoomAtScreenPoint(v, viewport, viewport.width * 0.5, viewport.height * 0.5, factor);
      renderer.setView(next);
      renderer.draw();
      notifyViewChange('zoom');
    },
    zoomAt: (sx, sy, factor) => {
      const v = renderer.getView();
      const viewport = renderer.getViewport();
      renderer.setView(zoomAtScreenPoint(v, viewport, sx, sy, factor));
      renderer.draw();
      notifyViewChange('zoom');
    },
    panAndZoomAt: (dxPx, dyPx, sx, sy, factor) => {
      let v = renderer.getView();
      const viewport = renderer.getViewport();
      const z = clampZoom(v.zoom);
      v = {
        ...v,
        panX: v.panX - dxPx / z,
        panY: v.panY + dyPx / z,
      };
      renderer.setView(zoomAtScreenPoint(v, viewport, sx, sy, factor));
      renderer.draw();
      notifyViewChange('zoom');
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
      notifyViewChange('pan');
    },
    draw: () => renderer.draw(),
    getView: () => renderer.getView(),
    getRenderer: () => renderer,
  };
}

import { lineWidthPxFromHundredths } from './segment-batch';
import {
  buildOrderedDrawBatches,
  buildOrderedDrawBatchesAsync,
  type DrawBatch,
} from './draw-ordered-batches';
import { yieldToMain } from '../yield-to-main';
import { colorBitsToRgba01, SEGMENT_STRIDE } from './segment-format';
import type { CadExtent } from './segment-format';
import {
  normalizeLayerVisibility,
  type LayerVisibilityInput,
  type LayerVisibilityState,
} from './layer-visibility';
import { FILL_VERT, LINE_FRAG, LINE_VERT, WIDE_LINE_VERT } from './shaders';
import { wideLineMeshFromPairs } from './wide-line-batch';
import { computeFitView, type CadView, type ViewportSize } from './view-math';
import type { CadRasterImage } from '../types';
import { CadRasterWebGlPass, P9_RASTER_WEBGL_ENABLED } from '../cad-raster-webgl';

export type CadWebGlRendererOptions = {
  clearColor?: [number, number, number, number];
  onContextLost?: () => void;
  onContextRestored?: () => void;
};

export const GL_RESOURCES_LOST_MESSAGE =
  'WebGL context lost — recreate GPU resources after contextrestored';

type GpuDrawBatch = DrawBatch & {
  vbo: WebGLBuffer;
  drawVertexCount: number;
  hairline: boolean;
};

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('createShader failed');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function concatParts(parts: Float32Array[]): Float32Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const positions = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    positions.set(part, offset);
    offset += part.length;
  }
  return positions;
}

function groupLineParts(batches: DrawBatch[], glyph: boolean): DrawBatch[] {
  const groups = new Map<number, Float32Array[]>();
  const order: number[] = [];
  for (const batch of batches) {
    if (batch.kind !== 'line') continue;
    const isGlyph = batch.lineWeightHundredths === GLYPH_STROKE_LINE_WEIGHT;
    if (isGlyph !== glyph) continue;
    let parts = groups.get(batch.colorBits);
    if (!parts) {
      parts = [];
      groups.set(batch.colorBits, parts);
      order.push(batch.colorBits);
    }
    parts.push(batch.positions);
  }
  return order.map((colorBits) => {
    const positions = concatParts(groups.get(colorBits)!);
    return {
      kind: 'line' as const,
      colorBits,
      lineWeightHundredths: glyph ? GLYPH_STROKE_LINE_WEIGHT : 25,
      positions,
      vertexCount: positions.length / 2,
    };
  });
}

/** Hairlines: one GL_LINES draw per color. Glyph strokes stay wide, one draw per color, after fills. */
function coalesceHairlineBatches(batches: DrawBatch[]): DrawBatch[] {
  const hair = groupLineParts(batches, false);
  const glyphs = groupLineParts(batches, true);
  const fills = batches.filter((batch) => batch.kind === 'fill');
  return [...hair, ...fills, ...glyphs];
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('createProgram failed');
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

/**
 * Glyph strokes from the version 1 text path use this weight.
 * Ordinary geometry in version 3 is drawn as GL_LINES; this weight stays on the wide-line mesh.
 */
const GLYPH_STROKE_LINE_WEIGHT = 13;

/** WebGL2 renderer: ordinary lines as GL_LINES, glyph strokes and fills unchanged from version 1. */
export class CadWebGlRenderer {
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private wideLineProgram: WebGLProgram | null = null;
  private lineProgram: WebGLProgram | null = null;
  private fillProgram: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;

  private readonly wideUniforms: {
    pan: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
    lineWidthPx: WebGLUniformLocation | null;
  } = { pan: null, zoom: null, viewport: null, color: null, lineWidthPx: null };

  private readonly lineUniforms: {
    pan: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
  } = { pan: null, zoom: null, viewport: null, color: null };

  private readonly fillUniforms: {
    pan: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
  } = { pan: null, zoom: null, viewport: null, color: null };

  private segments: Float32Array = new Float32Array(0);
  private triangles: Float32Array = new Float32Array(0);
  private segmentStride = SEGMENT_STRIDE;
  private layerVisibility: LayerVisibilityState = { mode: 'all' };
  private cpuBatches: DrawBatch[] = [];
  private gpuBatches: GpuDrawBatch[] = [];

  private view: CadView = { panX: 0, panY: 0, zoom: 1 };
  private viewport: ViewportSize = { width: 1, height: 1 };
  private readonly clearColor: [number, number, number, number];
  private readonly onContextLost?: () => void;
  private readonly onContextRestored?: () => void;

  private contextLost = false;
  private boundContextHandlers = false;
  private readonly rasterPass = new CadRasterWebGlPass();
  private rasterLoadGen = 0;

  constructor(canvas: HTMLCanvasElement, options: CadWebGlRendererOptions = {}) {
    this.canvas = canvas;
    this.clearColor = options.clearColor ?? [0.12, 0.13, 0.15, 1];
    this.onContextLost = options.onContextLost;
    this.onContextRestored = options.onContextRestored;
    this.bindContextEvents();
    this.initGl();
    this.resize();
  }

  isContextLost(): boolean {
    return this.contextLost;
  }

  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.viewport = { width: w, height: h };
    const gl = this.gl;
    if (gl && !this.contextLost) {
      gl.viewport(0, 0, w, h);
    }
  }

  setSegments(
    segments: Float32Array,
    triangles: Float32Array = new Float32Array(0),
    segmentStride = SEGMENT_STRIDE,
  ): void {
    this.segments = segments;
    this.triangles = triangles;
    this.segmentStride = segmentStride;
    this.rebuildCpuBatches(true);
    this.uploadGpuBatches();
  }

  async setSegmentsAsync(
    segments: Float32Array,
    triangles: Float32Array = new Float32Array(0),
    segmentStride = SEGMENT_STRIDE,
  ): Promise<void> {
    this.segments = segments;
    this.triangles = triangles;
    this.segmentStride = segmentStride;
    await this.rebuildCpuBatchesAsync(true);
    await yieldToMain();
    this.uploadGpuBatches();
  }

  prepareLayerVisibility(visibility: LayerVisibilityInput): void {
    this.layerVisibility = normalizeLayerVisibility(visibility);
  }

  setLayerVisibility(visibility: LayerVisibilityInput): void {
    this.layerVisibility = normalizeLayerVisibility(visibility);
    this.rebuildCpuBatches(true);
    this.uploadGpuBatches();
  }

  setView(view: CadView): void {
    this.view = { ...view };
  }

  getView(): CadView {
    return { ...this.view };
  }

  getViewport(): ViewportSize {
    return { ...this.viewport };
  }

  fitExtent(extent: CadExtent, paddingPx = 16): void {
    this.view = computeFitView(extent, this.viewport, paddingPx);
  }

  draw(): void {
    if (
      this.contextLost ||
      !this.gl ||
      !this.wideLineProgram ||
      !this.lineProgram ||
      !this.fillProgram
    ) {
      return;
    }
    const gl = this.gl;
    gl.clearColor(...this.clearColor);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const zoom = this.view.zoom;
    for (const batch of this.gpuBatches) {
      const [r, g, b, a] = colorBitsToRgba01(batch.colorBits);
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
      if (batch.hairline) {
        if (a >= 1) {
          gl.disable(gl.BLEND);
        } else {
          gl.enable(gl.BLEND);
        }
        gl.useProgram(this.lineProgram);
        gl.uniform2f(this.lineUniforms.pan, this.view.panX, this.view.panY);
        gl.uniform1f(this.lineUniforms.zoom, zoom);
        gl.uniform2f(this.lineUniforms.viewport, this.viewport.width, this.viewport.height);
        gl.uniform4f(this.lineUniforms.color, r, g, b, a);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.disableVertexAttribArray(1);
        gl.disableVertexAttribArray(2);
        gl.disableVertexAttribArray(3);
        gl.drawArrays(gl.LINES, 0, batch.drawVertexCount);
      } else if (batch.kind === 'fill') {
        gl.enable(gl.BLEND);
        gl.useProgram(this.fillProgram);
        gl.uniform2f(this.fillUniforms.pan, this.view.panX, this.view.panY);
        gl.uniform1f(this.fillUniforms.zoom, zoom);
        gl.uniform2f(this.fillUniforms.viewport, this.viewport.width, this.viewport.height);
        gl.uniform4f(this.fillUniforms.color, r, g, b, a);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.disableVertexAttribArray(1);
        gl.disableVertexAttribArray(2);
        gl.disableVertexAttribArray(3);
        gl.drawArrays(gl.TRIANGLES, 0, batch.drawVertexCount);
      } else {
        gl.enable(gl.BLEND);
        gl.useProgram(this.wideLineProgram);
        gl.uniform2f(this.wideUniforms.pan, this.view.panX, this.view.panY);
        gl.uniform1f(this.wideUniforms.zoom, zoom);
        gl.uniform2f(this.wideUniforms.viewport, this.viewport.width, this.viewport.height);
        gl.uniform4f(this.wideUniforms.color, r, g, b, a);
        gl.uniform1f(
          this.wideUniforms.lineWidthPx,
          lineWidthPxFromHundredths(batch.lineWeightHundredths, zoom),
        );
        const stride = 6 * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 16);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 20);
        gl.drawArrays(gl.TRIANGLES, 0, batch.drawVertexCount);
      }
    }

    if (P9_RASTER_WEBGL_ENABLED) {
      this.rasterPass.init(gl);
      this.rasterPass.draw(gl, this.view, this.viewport);
    }
  }

  setRasterScene(
    images: CadRasterImage[] | undefined,
    origin: [number, number],
    hiddenLayers: Set<number>,
    resolveImageUrl: (path: string) => Promise<string | null>,
  ): void {
    if (!P9_RASTER_WEBGL_ENABLED) return;
    const gl = this.gl;
    if (gl && !this.contextLost) {
      this.rasterPass.init(gl);
      this.rasterPass.releaseSceneTextures(gl);
    }
    this.rasterPass.setScene(images, origin, hiddenLayers, resolveImageUrl);
    void this.loadRastersAsync();
  }

  updateRasterHiddenLayers(hiddenLayers: Set<number>): void {
    if (!P9_RASTER_WEBGL_ENABLED) return;
    this.rasterPass.updateHiddenLayers(hiddenLayers);
    this.draw();
  }

  private async loadRastersAsync(): Promise<void> {
    const gl = this.gl;
    if (!gl || this.contextLost || !P9_RASTER_WEBGL_ENABLED) return;
    this.rasterPass.init(gl);
    const gen = ++this.rasterLoadGen;
    await this.rasterPass.ensureLoaded(gl);
    if (gen === this.rasterLoadGen) {
      this.draw();
    }
  }

  destroy(): void {
    this.unbindContextEvents();
    this.segments = new Float32Array(0);
    this.triangles = new Float32Array(0);
    this.cpuBatches = [];
    this.disposeGpu();
    const gl = this.gl;
    this.rasterPass.dispose(gl);
    if (gl) {
      if (this.wideLineProgram) gl.deleteProgram(this.wideLineProgram);
      if (this.lineProgram) gl.deleteProgram(this.lineProgram);
      if (this.fillProgram) gl.deleteProgram(this.fillProgram);
    }
    this.wideLineProgram = null;
    this.lineProgram = null;
    this.fillProgram = null;
    this.gl = null;
  }

  private bindContextEvents(): void {
    if (this.boundContextHandlers) {
      return;
    }
    this.boundContextHandlers = true;
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private unbindContextEvents(): void {
    if (!this.boundContextHandlers) {
      return;
    }
    this.boundContextHandlers = false;
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.disposeGpu();
    this.onContextLost?.();
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    this.initGl();
    this.resize();
    this.uploadGpuBatches();
    this.onContextRestored?.();
  };

  private initGl(): void {
    const gl =
      this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance',
      }) ?? null;
    if (!gl) {
      throw new Error('WebGL2 not available');
    }
    this.gl = gl;

    const wideVs = compileShader(gl, gl.VERTEX_SHADER, WIDE_LINE_VERT);
    const lineVs = compileShader(gl, gl.VERTEX_SHADER, LINE_VERT);
    const fillVs = compileShader(gl, gl.VERTEX_SHADER, FILL_VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, LINE_FRAG);
    this.wideLineProgram = linkProgram(gl, wideVs, fs);
    this.lineProgram = linkProgram(gl, lineVs, fs);
    this.fillProgram = linkProgram(gl, fillVs, fs);
    gl.deleteShader(wideVs);
    gl.deleteShader(lineVs);
    gl.deleteShader(fillVs);
    gl.deleteShader(fs);

    this.wideUniforms.pan = gl.getUniformLocation(this.wideLineProgram, 'u_pan');
    this.wideUniforms.zoom = gl.getUniformLocation(this.wideLineProgram, 'u_zoom');
    this.wideUniforms.viewport = gl.getUniformLocation(this.wideLineProgram, 'u_viewport');
    this.wideUniforms.color = gl.getUniformLocation(this.wideLineProgram, 'u_color');
    this.wideUniforms.lineWidthPx = gl.getUniformLocation(this.wideLineProgram, 'u_lineWidthPx');

    this.lineUniforms.pan = gl.getUniformLocation(this.lineProgram, 'u_pan');
    this.lineUniforms.zoom = gl.getUniformLocation(this.lineProgram, 'u_zoom');
    this.lineUniforms.viewport = gl.getUniformLocation(this.lineProgram, 'u_viewport');
    this.lineUniforms.color = gl.getUniformLocation(this.lineProgram, 'u_color');

    this.fillUniforms.pan = gl.getUniformLocation(this.fillProgram, 'u_pan');
    this.fillUniforms.zoom = gl.getUniformLocation(this.fillProgram, 'u_zoom');
    this.fillUniforms.viewport = gl.getUniformLocation(this.fillProgram, 'u_viewport');
    this.fillUniforms.color = gl.getUniformLocation(this.fillProgram, 'u_color');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindVertexArray(null);
  }

  private rebuildCpuBatches(force: boolean): void {
    if (this.segments.length === 0 && this.triangles.length === 0) {
      this.cpuBatches = [];
      return;
    }
    if (!force && this.cpuBatches.length > 0) {
      return;
    }
    this.cpuBatches = coalesceHairlineBatches(
      buildOrderedDrawBatches(
        this.segments,
        this.triangles,
        this.layerVisibility,
        this.segmentStride,
      ),
    );
  }

  private async rebuildCpuBatchesAsync(force: boolean): Promise<void> {
    if (this.segments.length === 0 && this.triangles.length === 0) {
      this.cpuBatches = [];
      return;
    }
    if (!force && this.cpuBatches.length > 0) {
      return;
    }
    this.cpuBatches = coalesceHairlineBatches(
      await buildOrderedDrawBatchesAsync(
        this.segments,
        this.triangles,
        this.layerVisibility,
        this.segmentStride,
      ),
    );
  }

  private uploadGpuBatches(): void {
    this.disposeGpu();
    const gl = this.gl;
    if (!gl || this.contextLost) {
      return;
    }
    this.gpuBatches = this.cpuBatches.map((batch) => {
      const vbo = gl.createBuffer();
      if (!vbo) {
        throw new Error('createBuffer failed');
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      const hairline =
        batch.kind === 'line' && batch.lineWeightHundredths !== GLYPH_STROKE_LINE_WEIGHT;
      if (batch.kind === 'fill' || hairline) {
        gl.bufferData(gl.ARRAY_BUFFER, batch.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return {
          ...batch,
          vbo,
          drawVertexCount: batch.vertexCount,
          hairline,
        };
      }
      const mesh = wideLineMeshFromPairs(batch.positions);
      gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return {
        ...batch,
        vbo,
        drawVertexCount: mesh.length / 6,
        hairline: false,
      };
    });
  }

  private disposeGpu(): void {
    const gl = this.gl;
    if (gl) {
      for (const batch of this.gpuBatches) {
        gl.deleteBuffer(batch.vbo);
      }
    }
    this.gpuBatches = [];
  }
}

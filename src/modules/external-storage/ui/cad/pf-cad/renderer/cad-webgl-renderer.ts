import {
  buildColorLineBatches,
  buildColorLineBatchesAsync,
  type ColorLineBatch,
} from './segment-batch';
import { yieldToMain } from '../yield-to-main';
import { colorBitsToRgb01 } from './segment-format';
import type { CadExtent } from './segment-format';
import {
  normalizeLayerVisibility,
  type LayerVisibilityInput,
  type LayerVisibilityState,
} from './layer-visibility';
import { LINE_FRAG, LINE_VERT } from './shaders';
import { computeFitView, type CadView, type ViewportSize } from './view-math';

export type CadWebGlRendererOptions = {
  clearColor?: [number, number, number, number];
  onContextLost?: () => void;
  onContextRestored?: () => void;
};

export const GL_RESOURCES_LOST_MESSAGE =
  'WebGL context lost — recreate GPU resources after contextrestored';

type GpuBatch = ColorLineBatch & {
  vbo: WebGLBuffer;
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

/** WebGL2 batched line renderer for pf-cad-wasm segment buffers (RTC coords). */
export class CadWebGlRenderer {
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private readonly uniforms: {
    pan: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
  } = { pan: null, zoom: null, viewport: null, color: null };

  private segments: Float32Array = new Float32Array(0);
  private layerVisibility: LayerVisibilityState = { mode: 'all' };
  private cpuBatches: ColorLineBatch[] = [];
  private gpuBatches: GpuBatch[] = [];

  private view: CadView = { panX: 0, panY: 0, zoom: 1 };
  private viewport: ViewportSize = { width: 1, height: 1 };
  private readonly clearColor: [number, number, number, number];
  private readonly onContextLost?: () => void;
  private readonly onContextRestored?: () => void;

  private contextLost = false;
  private boundContextHandlers = false;

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

  setSegments(segments: Float32Array): void {
    this.segments = segments;
    this.rebuildCpuBatches();
    this.uploadGpuBatches();
  }

  async setSegmentsAsync(segments: Float32Array): Promise<void> {
    this.segments = segments;
    await this.rebuildCpuBatchesAsync();
    await yieldToMain();
    this.uploadGpuBatches();
  }

  /** Set layer mask before {@link setSegmentsAsync} to avoid a second full batch rebuild. */
  prepareLayerVisibility(visibility: LayerVisibilityInput): void {
    this.layerVisibility = normalizeLayerVisibility(visibility);
  }

  setLayerVisibility(visibility: LayerVisibilityInput): void {
    this.layerVisibility = normalizeLayerVisibility(visibility);
    this.rebuildCpuBatches();
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
    if (this.contextLost || !this.gl || !this.program) {
      return;
    }
    const gl = this.gl;
    gl.clearColor(...this.clearColor);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.pan, this.view.panX, this.view.panY);
    gl.uniform1f(this.uniforms.zoom, this.view.zoom);
    gl.uniform2f(this.uniforms.viewport, this.viewport.width, this.viewport.height);

    for (const batch of this.gpuBatches) {
      const [r, g, b] = colorBitsToRgb01(batch.colorBits);
      gl.uniform4f(this.uniforms.color, r, g, b, 1);
      gl.lineWidth(batch.lineWidthPx);
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.vbo);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.drawArrays(gl.LINES, 0, batch.vertexCount);
    }
  }

  destroy(): void {
    this.unbindContextEvents();
    this.segments = new Float32Array(0);
    this.cpuBatches = [];
    this.disposeGpu();
    const gl = this.gl;
    if (gl && this.program) {
      gl.deleteProgram(this.program);
    }
    this.program = null;
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
        alpha: false,
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
    const vs = compileShader(gl, gl.VERTEX_SHADER, LINE_VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, LINE_FRAG);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.uniforms.pan = gl.getUniformLocation(this.program, 'u_pan');
    this.uniforms.zoom = gl.getUniformLocation(this.program, 'u_zoom');
    this.uniforms.viewport = gl.getUniformLocation(this.program, 'u_viewport');
    this.uniforms.color = gl.getUniformLocation(this.program, 'u_color');

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindVertexArray(null);
  }

  private rebuildCpuBatches(): void {
    if (this.segments.length === 0) {
      this.cpuBatches = [];
      return;
    }
    const { batches } = buildColorLineBatches(this.segments, this.layerVisibility, this.view.zoom);
    this.cpuBatches = batches;
  }

  private async rebuildCpuBatchesAsync(): Promise<void> {
    if (this.segments.length === 0) {
      this.cpuBatches = [];
      return;
    }
    const { batches } = await buildColorLineBatchesAsync(
      this.segments,
      this.layerVisibility,
      this.view.zoom,
    );
    this.cpuBatches = batches;
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
      gl.bufferData(gl.ARRAY_BUFFER, batch.positions, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return { ...batch, vbo };
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

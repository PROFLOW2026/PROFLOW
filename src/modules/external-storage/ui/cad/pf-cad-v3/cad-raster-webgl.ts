import type { CadRasterImage } from './types';
import type { CadView, ViewportSize } from './renderer';
import { colorBitsToRgba01 } from './renderer/segment-format';
import { RASTER_FRAG, RASTER_VERT } from './renderer/shaders';
import { normalizeRasterClip, RASTER_CLIP_MAX_VERTS } from './cad-raster-clip';

export const P9_RASTER_WEBGL_ENABLED = true;

type RasterResolveUrl = (path: string) => Promise<string | null>;

type LoadedRaster = {
  image: CadRasterImage;
  texture: WebGLTexture;
  url: string;
};

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`Raster shader compile failed: ${log}`);
  }
  return shader;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`Raster program link failed: ${log}`);
  }
  return program;
}

/** WebGL textured quads for DWG raster images (P9). */
export class CadRasterWebGlPass {
  private program: WebGLProgram | null = null;
  private uniforms: {
    pan: WebGLUniformLocation | null;
    zoom: WebGLUniformLocation | null;
    viewport: WebGLUniformLocation | null;
    color: WebGLUniformLocation | null;
    texture: WebGLUniformLocation | null;
    clipCount: WebGLUniformLocation | null;
    clip: WebGLUniformLocation | null;
  } = {
    pan: null,
    zoom: null,
    viewport: null,
    color: null,
    texture: null,
    clipCount: null,
    clip: null,
  };

  private vbo: WebGLBuffer | null = null;
  private images: CadRasterImage[] = [];
  private origin: [number, number] = [0, 0];
  private hiddenLayers = new Set<number>();
  private resolveUrl: RasterResolveUrl = async () => null;
  private loaded: LoadedRaster[] = [];
  private loading = new Map<string, Promise<LoadedRaster | null>>();
  private urlToTexture = new Map<string, WebGLTexture>();
  private dirty = true;

  init(gl: WebGL2RenderingContext): void {
    if (this.program) return;
    const vs = compileShader(gl, gl.VERTEX_SHADER, RASTER_VERT);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, RASTER_FRAG);
    this.program = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.uniforms.pan = gl.getUniformLocation(this.program, 'u_pan');
    this.uniforms.zoom = gl.getUniformLocation(this.program, 'u_zoom');
    this.uniforms.viewport = gl.getUniformLocation(this.program, 'u_viewport');
    this.uniforms.color = gl.getUniformLocation(this.program, 'u_color');
    this.uniforms.texture = gl.getUniformLocation(this.program, 'u_texture');
    this.uniforms.clipCount = gl.getUniformLocation(this.program, 'u_clipCount');
    this.uniforms.clip = gl.getUniformLocation(this.program, 'u_clip[0]');
    this.vbo = gl.createBuffer();
  }

  /** Drop GPU textures from the previous scene (keeps program/buffer). */
  releaseSceneTextures(gl: WebGL2RenderingContext): void {
    for (const url of this.urlToTexture.keys()) {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    }
    for (const tex of this.urlToTexture.values()) {
      gl.deleteTexture(tex);
    }
    this.urlToTexture.clear();
    this.loaded = [];
    this.loading.clear();
    this.dirty = true;
  }

  setScene(
    images: CadRasterImage[] | undefined,
    origin: [number, number],
    hiddenLayers: Set<number>,
    resolveUrl: RasterResolveUrl,
  ): void {
    this.images = images ?? [];
    this.origin = origin;
    this.hiddenLayers = hiddenLayers;
    this.resolveUrl = resolveUrl;
    this.dirty = true;
    this.loaded = [];
    this.loading.clear();
  }

  updateHiddenLayers(hiddenLayers: Set<number>): void {
    this.hiddenLayers = hiddenLayers;
  }

  async ensureLoaded(gl: WebGL2RenderingContext): Promise<void> {
    if (!this.dirty) return;
    const next: LoadedRaster[] = [];
    for (const image of this.images) {
      if (this.hiddenLayers.has(image.layer)) continue;
      if (!image.path?.trim() || image.corners.length < 4) continue;
      const key = image.path;
      let pending = this.loading.get(key);
      if (!pending) {
        pending = this.loadOne(gl, image);
        this.loading.set(key, pending);
      }
      const hit = await pending;
      this.loading.delete(key);
      if (hit) next.push(hit);
    }
    this.loaded = next;
    this.dirty = false;
  }

  draw(gl: WebGL2RenderingContext, view: CadView, viewport: ViewportSize): void {
    if (!this.program || !this.vbo || this.loaded.length === 0) return;
    gl.useProgram(this.program);
    gl.uniform2f(this.uniforms.pan, view.panX, view.panY);
    gl.uniform1f(this.uniforms.zoom, view.zoom);
    gl.uniform2f(this.uniforms.viewport, viewport.width, viewport.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    for (const { image, texture } of this.loaded) {
      if (this.hiddenLayers.has(image.layer)) continue;
      const [ox, oy] = this.origin;
      const corners = image.corners;
      const p0 = corners[0]!;
      const p1 = corners[1]!;
      const p2 = corners[2]!;
      const p3 = corners[3]!;
      const verts = new Float32Array([
        p0[0] - ox,
        p0[1] - oy,
        0,
        0,
        p1[0] - ox,
        p1[1] - oy,
        1,
        0,
        p2[0] - ox,
        p2[1] - oy,
        1,
        1,
        p0[0] - ox,
        p0[1] - oy,
        0,
        0,
        p2[0] - ox,
        p2[1] - oy,
        1,
        1,
        p3[0] - ox,
        p3[1] - oy,
        0,
        1,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      const [r, g, b, a] = colorBitsToRgba01(image.c >>> 0);
      gl.uniform4f(this.uniforms.color, r, g, b, a);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(this.uniforms.texture, 0);

      const clipRtc = image.clip?.map(([x, y]) => [x - ox, y - oy] as [number, number]);
      const clipCount = clipRtc?.length
        ? Math.min(clipRtc.length, RASTER_CLIP_MAX_VERTS)
        : 0;
      gl.uniform1i(this.uniforms.clipCount, clipCount);
      if (clipCount >= 3 && this.uniforms.clip) {
        gl.uniform2fv(this.uniforms.clip, normalizeRasterClip(clipRtc));
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  dispose(gl: WebGL2RenderingContext | null): void {
    if (gl) {
      this.releaseSceneTextures(gl);
      if (this.vbo) gl.deleteBuffer(this.vbo);
      if (this.program) gl.deleteProgram(this.program);
    } else {
      this.urlToTexture.clear();
      this.loaded = [];
      this.loading.clear();
    }
    this.program = null;
    this.vbo = null;
  }

  private async loadOne(gl: WebGL2RenderingContext, image: CadRasterImage): Promise<LoadedRaster | null> {
    const url = await this.resolveUrl(image.path);
    if (!url) return null;
    let texture = this.urlToTexture.get(url);
    if (!texture) {
      const tex = await this.uploadImage(gl, url);
      if (!tex) return null;
      texture = tex;
      this.urlToTexture.set(url, texture);
    }
    return { image, texture, url };
  }

  private uploadImage(gl: WebGL2RenderingContext, url: string): Promise<WebGLTexture | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const tex = gl.createTexture();
        if (!tex) {
          resolve(null);
          return;
        }
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.bindTexture(gl.TEXTURE_2D, null);
        resolve(tex);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
}

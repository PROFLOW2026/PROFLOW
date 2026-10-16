import { afterEach, describe, expect, it, vi } from 'vitest';
import { pointInPolygon } from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-clip';
import { CadRasterWebGlPass } from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-webgl';
import type { CadView, ViewportSize } from '@/modules/external-storage/ui/cad/pf-cad/renderer';
import {
  buildStorageCadFileIndex,
  clearStorageCadBytesCache,
  isCadSupportSiblingFileName,
} from '@/modules/external-storage/ui/cad/pf-cad/storage-cad-file-index';
import { lookupInIndex } from '@/modules/external-storage/ui/cad/pf-cad/xref-resolver';
import {
  buildP9DevFileIndex,
  createP9RasterResolveUrl,
  loadP9Scene,
  P9_HOST_PATH,
  p9UiLayers,
  readP9RasterBytes,
  syncP9RasterScene,
} from '../../../tests/fixtures/cad/synthetic-p9/harness';

vi.mock('@/modules/external-storage/ui/cad/fetch-storage-preview-bytes', () => ({
  fetchStoragePreviewBytes: vi.fn(async () => readP9RasterBytes().buffer),
}));

function mockGl() {
  const deleted: unknown[] = [];
  let nextId = 1;
  const gl = {
    createTexture: vi.fn(() => ({ id: nextId++ })),
    deleteTexture: vi.fn((t: unknown) => {
      deleted.push(t);
    }),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(() => true),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    useProgram: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniform2f: vi.fn(),
    uniform1f: vi.fn(),
    uniform4f: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    drawArrays: vi.fn(),
    activeTexture: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    ARRAY_BUFFER: 2,
    TEXTURE_2D: 3,
    TEXTURE0: 4,
    CLAMP_TO_EDGE: 5,
    LINEAR: 6,
    RGBA: 7,
    UNSIGNED_BYTE: 8,
    COMPILE_STATUS: 9,
    LINK_STATUS: 10,
    FLOAT: 11,
    TRIANGLES: 12,
    DYNAMIC_DRAW: 13,
  } as unknown as WebGL2RenderingContext;
  return { gl, deleted };
}

class MockImage {
  crossOrigin = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  get src() {
    return this._src;
  }
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
}

describe('cad P9 integration (synthetic-p9 fixture)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearStorageCadBytesCache();
  });

  it('indexes raster siblings via buildStorageCadFileIndex', async () => {
    expect(isCadSupportSiblingFileName('p9-raster-tile.png')).toBe(true);
    const bytes = readP9RasterBytes();
    const index = buildStorageCadFileIndex({
      siblingFiles: [{ id: 'file-p9-png', name: 'p9-raster-tile.png' }],
      scope: 'project',
      projectId: 'proj-p9',
    });
    const hit = lookupInIndex(index, P9_HOST_PATH, 'p9-raster-tile.png');
    expect(hit).not.toBeNull();
    const loaded = await hit!.getBytes();
    expect(loaded.byteLength).toBe(bytes.byteLength);
  });

  it('syncRaster path resolves PNG, loads WebGL textures, and revokes blob URLs', async () => {
    vi.stubGlobal('Image', MockImage);
    const scene = loadP9Scene();
    const image = scene.images![0]!;
    expect(pointInPolygon(120, 210, image.clip!)).toBe(true);
    expect(pointInPolygon(109, 210, image.clip!)).toBe(false);

    const fileIndex = buildP9DevFileIndex();
    const pass = new CadRasterWebGlPass();
    const { gl, deleted } = mockGl();
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    syncP9RasterScene(pass, gl, scene, p9UiLayers(scene), fileIndex);

    await pass.ensureLoaded(gl);
    expect(pass['loaded'].length).toBe(1);
    const blobUrl = pass['loaded'][0]!.url;
    expect(blobUrl.startsWith('blob:')).toBe(true);

    const view: CadView = { panX: 0, panY: 0, zoom: 1 };
    const viewport: ViewportSize = { width: 640, height: 480 };
    pass.draw(gl, view, viewport);
    expect(gl.uniform2fv).toHaveBeenCalled();

    pass.releaseSceneTextures(gl);
    expect(deleted.length).toBeGreaterThan(0);
    expect(revoke).toHaveBeenCalledWith(blobUrl);
    expect(pass['urlToTexture'].size).toBe(0);
  });

  it('createP9RasterResolveUrl matches dev file index lookup', async () => {
    const resolve = createP9RasterResolveUrl(buildP9DevFileIndex(), P9_HOST_PATH);
    const url = await resolve('p9-raster-tile.png');
    expect(url).toMatch(/^blob:/);
    if (url) URL.revokeObjectURL(url);
  });
});

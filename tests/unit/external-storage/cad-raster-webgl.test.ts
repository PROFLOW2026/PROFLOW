import { afterEach, describe, expect, it, vi } from 'vitest';
import { CadRasterWebGlPass } from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-webgl';
import type { CadRasterImage } from '@/modules/external-storage/ui/cad/pf-cad/types';

function mockGl() {
  const deleted: unknown[] = [];
  const textures = new Map<number, object>();
  let nextId = 1;
  const gl = {
    createTexture: vi.fn(() => {
      const t = { id: nextId++ };
      textures.set(t.id, t);
      return t;
    }),
    deleteTexture: vi.fn((t: { id: number }) => {
      deleted.push(t);
      textures.delete(t.id);
    }),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    pixelStorei: vi.fn(),
    texImage2D: vi.fn(),
    createShader: vi.fn(() => ({ compile: true })),
    shaderSource: vi.fn(),
    compileShader: vi.fn(() => true),
    getShaderParameter: vi.fn(() => true),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    deleteProgram: vi.fn(),
    getUniformLocation: vi.fn(() => null),
    createBuffer: vi.fn(() => ({})),
    deleteBuffer: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    useProgram: vi.fn(),
    uniform1i: vi.fn(),
    uniform2fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    drawArrays: vi.fn(),
    activeTexture: vi.fn(),
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

const sampleImage: CadRasterImage = {
  path: 'synthetic-tile.png',
  layer: 0,
  c: 0xffffffff,
  corners: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
  clip: [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ],
};

describe('CadRasterWebGlPass', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('releaseSceneTextures deletes uploaded textures and revokes blob URLs', async () => {
    const pass = new CadRasterWebGlPass();
    const { gl, deleted } = mockGl();
    pass.init(gl);

    const blobUrl = 'blob:http://localhost/fake-raster-tile';
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    pass.setScene(
      [sampleImage],
      [0, 0],
      new Set(),
      async () => blobUrl,
    );
    const texture = gl.createTexture()!;
    pass['urlToTexture'].set(blobUrl, texture);
    pass['loaded'] = [{ image: sampleImage, texture, url: blobUrl }];

    pass.releaseSceneTextures(gl);

    expect(deleted.length).toBeGreaterThan(0);
    expect(revoke).toHaveBeenCalledWith(blobUrl);
    expect(pass['urlToTexture'].size).toBe(0);
    expect(pass['loaded']).toEqual([]);
  });

  it('dispose calls releaseSceneTextures', () => {
    const pass = new CadRasterWebGlPass();
    const { gl } = mockGl();
    pass.init(gl);
    const spy = vi.spyOn(pass, 'releaseSceneTextures');
    pass.dispose(gl);
    expect(spy).toHaveBeenCalledWith(gl);
  });

  it('setScene clears in-flight loads so stale textures are not kept', () => {
    const pass = new CadRasterWebGlPass();
    pass.setScene([sampleImage], [1, 2], new Set([3]), async () => 'blob:a');
    expect(pass['images']).toHaveLength(1);
    expect(pass['dirty']).toBe(true);
    expect(pass['loading'].size).toBe(0);
    expect(pass['loaded']).toEqual([]);
  });
});

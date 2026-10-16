import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CAD zoom path (no geometry rebatch on view change)', () => {
  it('setView updates uniforms only; batch rebuild stays on setSegments', () => {
    const rendererPath = path.join(
      process.cwd(),
      'src/modules/external-storage/ui/cad/pf-cad/renderer/cad-webgl-renderer.ts',
    );
    const src = readFileSync(rendererPath, 'utf8');
    const setViewBlock = src.slice(src.indexOf('setView(view: CadView)'), src.indexOf('getView(): CadView'));
    expect(setViewBlock).not.toContain('rebuildCpuBatches');
    expect(setViewBlock).not.toContain('uploadGpuBatches');
    expect(setViewBlock).not.toContain('setSegments');
    expect(src).toMatch(/draw\(\)[\s\S]*uniform1f\(this\.(wide|fill)Uniforms\.zoom/);
  });
});

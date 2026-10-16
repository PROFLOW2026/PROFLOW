import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PF_CAD_WASM_BINARY_URL,
  PF_CAD_WASM_GLUE_URL,
} from '@/modules/external-storage/ui/cad/pf-cad/pf-cad-config';
import {
  PF_CAD_WASM_BINARY_URL as V1_WASM_URL,
  PF_CAD_WASM_GLUE_URL as V1_GLUE_URL,
} from '@/modules/external-storage/ui/cad/pf-cad-v1/pf-cad-config';
import {
  PF_CAD_WASM_BINARY_URL as V3_WASM_URL,
  PF_CAD_WASM_GLUE_URL as V3_GLUE_URL,
} from '@/modules/external-storage/ui/cad/pf-cad-v3/pf-cad-config';
import { DEFAULT_CAD_VIEWER_VERSION } from '@/modules/external-storage/ui/cad/cad-viewer-version-select';

const root = process.cwd();
const wasmDir = path.join(root, 'public', 'pf-cad', 'v2', 'wasm');
const wasmPath = path.join(wasmDir, 'pf_cad_wasm_bg.wasm');
const gluePath = path.join(wasmDir, 'pf_cad_wasm.js');
const manifestPath = path.join(wasmDir, 'version.json');

describe('pf-cad wasm static assets', () => {
  it('is committed under public/pf-cad/v2/wasm for the current viewer', () => {
    expect(fs.existsSync(wasmPath)).toBe(true);
    expect(fs.existsSync(gluePath)).toBe(true);
    const size = fs.statSync(wasmPath).size;
    expect(size).toBeGreaterThan(1_000_000);
  });

  it('exports set_plot_mode in glue typings', () => {
    const dts = fs.readFileSync(path.join(wasmDir, 'pf_cad_wasm.d.ts'), 'utf8');
    expect(dts).toContain('set_plot_mode');
    expect(dts).toContain('set_plot_ctb');
  });

  it('has a version manifest', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      wasm: string;
      glue: string;
    };
    expect(manifest.wasm).toBe('pf_cad_wasm_bg.wasm');
    expect(manifest.glue).toBe('pf_cad_wasm.js');
  });

  it('uses the public URLs expected by the worker', () => {
    expect(PF_CAD_WASM_BINARY_URL).toBe('/pf-cad/v2/wasm/pf_cad_wasm_bg.wasm');
    expect(PF_CAD_WASM_GLUE_URL).toBe('/pf-cad/v2/wasm/pf_cad_wasm.js');
    expect(V1_WASM_URL).toBe('/pf-cad/v1/wasm/pf_cad_wasm_bg.wasm');
    expect(V1_GLUE_URL).toBe('/pf-cad/v1/wasm/pf_cad_wasm.js');
    expect(V1_WASM_URL).not.toBe(PF_CAD_WASM_BINARY_URL);
    expect(V3_WASM_URL).toBe('/pf-cad/v3/wasm/pf_cad_wasm_bg.wasm');
    expect(V3_GLUE_URL).toBe('/pf-cad/v3/wasm/pf_cad_wasm.js');
    expect(V3_WASM_URL).not.toBe(PF_CAD_WASM_BINARY_URL);
    expect(V3_WASM_URL).not.toBe(V1_WASM_URL);
    expect(DEFAULT_CAD_VIEWER_VERSION).toBe('v1');
    const versionedViewer = fs.readFileSync(
      path.join(root, 'src/modules/external-storage/ui/cad/pf-dwg-versioned-viewer.tsx'),
      'utf8',
    );
    expect(versionedViewer).toContain("v1: () => import('./pf-cad/pf-dwg-viewer')");
    expect(versionedViewer).toContain("v2: () => import('./pf-cad-v1/pf-dwg-viewer')");
    expect(versionedViewer).toContain("v3: () => import('./pf-cad-v3/pf-dwg-viewer')");
    const v1Wasm = path.join(root, 'public', 'pf-cad', 'v1', 'wasm', 'pf_cad_wasm_bg.wasm');
    expect(fs.existsSync(v1Wasm)).toBe(true);
    expect(fs.statSync(v1Wasm).size).toBeGreaterThan(1_000_000);
    const v1Worker = fs.readFileSync(
      path.join(root, 'src/modules/external-storage/ui/cad/pf-cad-v1/cad-engine.worker.ts'),
      'utf8',
    );
    const v2Worker = fs.readFileSync(
      path.join(root, 'src/modules/external-storage/ui/cad/pf-cad/cad-engine.worker.ts'),
      'utf8',
    );
    expect(v1Worker).toContain("from './pf-cad-config'");
    expect(v1Worker).not.toContain('/pf-cad/v2/');
    expect(v2Worker).toContain('PF_CAD_WASM_VERSION_URL');
    expect(v2Worker).not.toContain('/pf-cad/v1/');
    const v3Wasm = path.join(root, 'public', 'pf-cad', 'v3', 'wasm', 'pf_cad_wasm_bg.wasm');
    expect(fs.existsSync(v3Wasm)).toBe(true);
    expect(fs.statSync(v3Wasm).size).toBe(fs.statSync(wasmPath).size);
    const v3Worker = fs.readFileSync(
      path.join(root, 'src/modules/external-storage/ui/cad/pf-cad-v3/cad-engine.worker.ts'),
      'utf8',
    );
    expect(v3Worker).toContain("from './pf-cad-config'");
    expect(v3Worker).not.toContain('/pf-cad/v1/');
    expect(v3Worker).not.toContain('/pf-cad/v2/');
  });
});

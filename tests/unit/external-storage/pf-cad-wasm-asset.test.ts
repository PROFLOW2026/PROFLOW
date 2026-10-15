import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PF_CAD_WASM_BINARY_URL,
  PF_CAD_WASM_GLUE_URL,
} from '@/modules/external-storage/ui/cad/pf-cad/pf-cad-config';

const root = process.cwd();
const wasmDir = path.join(root, 'public', 'pf-cad', 'wasm');
const wasmPath = path.join(wasmDir, 'pf_cad_wasm_bg.wasm');
const gluePath = path.join(wasmDir, 'pf_cad_wasm.js');
const manifestPath = path.join(wasmDir, 'version.json');

describe('pf-cad wasm static assets', () => {
  it('is committed under public/pf-cad/wasm for Vercel static output', () => {
    expect(fs.existsSync(wasmPath)).toBe(true);
    expect(fs.existsSync(gluePath)).toBe(true);
    const size = fs.statSync(wasmPath).size;
    expect(size).toBeGreaterThan(1_000_000);
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
    expect(PF_CAD_WASM_BINARY_URL).toBe('/pf-cad/wasm/pf_cad_wasm_bg.wasm');
    expect(PF_CAD_WASM_GLUE_URL).toBe('/pf-cad/wasm/pf_cad_wasm.js');
  });
});

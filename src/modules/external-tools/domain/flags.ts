/** New sessions require the flag. Cleanup and a terminal callback stay available when it is off. */
export function externalToolsEnabled(): boolean {
  return process.env.PF_EXTERNAL_TOOLS === '1';
}

/** Off: the external viewer uses the existing v1 URL. On: it asks for the isolated binary. */
export function externalWasmEnabled(): boolean {
  return process.env.PF_EXTERNAL_WASM === '1';
}

export const EXTERNAL_WASM_URL = '/pf-cad/external/wasm';
export const EXTERNAL_WASM_ABI = 'xref-parent-1';

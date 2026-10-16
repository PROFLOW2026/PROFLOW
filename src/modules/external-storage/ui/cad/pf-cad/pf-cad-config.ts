/** Same-origin pf-cad WASM bundle under public/ (copied from projectflow-cad-engine). */
export const PF_CAD_WASM_BINARY_URL = '/pf-cad/wasm/pf_cad_wasm_bg.wasm';
export const PF_CAD_WASM_GLUE_URL = '/pf-cad/wasm/pf_cad_wasm.js';

/** WebGL triangle fills from WASM (hatch SOLID, wipeout). Lines stay on GL.LINES. */
export const PF_CAD_GPU_TRIANGLE_FILLS = true;

/** World-space quad lineweights — off (3096-EL regression when combined with full-scene quads). */
export const PF_CAD_GPU_LINE_QUADS = false;

/** @deprecated Use {@link PF_CAD_GPU_TRIANGLE_FILLS} and {@link PF_CAD_GPU_LINE_QUADS}. */
export const PF_CAD_EXPERIMENTAL_GPU_FILLS_AND_QUADS = false;

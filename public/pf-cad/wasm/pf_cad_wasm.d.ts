/* tslint:disable */
/* eslint-disable */

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly add_xref_dep: (a: number, b: number, c: number, d: number) => number;
    readonly alloc: (a: number) => number;
    readonly build_dl: (a: number, b: number) => number;
    readonly clear_xref_deps: () => void;
    readonly json_len: () => number;
    readonly json_ptr: () => number;
    readonly segs_ptr: () => number;
    readonly set_host_path: (a: number, b: number) => void;
    readonly set_plot_ctb: (a: number, b: number) => number;
    readonly set_plot_mode: (a: number) => void;
    readonly set_space: (a: number, b: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

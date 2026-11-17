/** Frozen viewer binary. Publishing must never write this directory. */
export function assertPublishableWasmDir(dir) {
  const normalized = String(dir).replace(/\\/g, '/');
  if (normalized.includes('/pf-cad/v1/') || normalized.endsWith('/pf-cad/v1')) {
    throw new Error('refusing to write frozen pf-cad v1 wasm');
  }
}

/**
 * Default keeps the published bytes. An explicit v2 or v3 slot is the only write.
 * v1 is the frozen button and is refused.
 */
export function resolvePublishDir(root, explicit) {
  if (!explicit) return null;
  if (explicit === 'v1') {
    throw new Error('refusing to publish the frozen wasm slot');
  }
  if (explicit !== 'v2' && explicit !== 'v3') {
    throw new Error(`unknown wasm publish target ${explicit}`);
  }
  const dir = `${String(root).replace(/\\/g, '/')}/public/pf-cad/${explicit}/wasm`;
  assertPublishableWasmDir(dir);
  return dir;
}

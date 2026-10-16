import {
  P8_GPU_TEXT_HANDOFF_ENABLED,
  shxTextRequiresCanvasFallback,
} from './cad-gpu-text-policy';
import { appendShxGpuSegments } from './shx-text-segments';
import type { ScenePayload } from './types';

/** Merge SHX stroke segments into the WASM buffer after fonts are registered (P8). */
export function applyCadP8GpuTextHandoff(
  segments: Float32Array,
  scene: ScenePayload,
): { segments: Float32Array; scene: ScenePayload } {
  let texts = scene.texts.map((t) => {
    if (shxTextRequiresCanvasFallback(t) && t.gpu) {
      const { gpu: _gpu, ...rest } = t;
      return rest;
    }
    return t;
  });
  let nextScene = { ...scene, texts };
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) {
    return { segments, scene: nextScene };
  }
  const origin = scene.origin ?? [0, 0];
  const out = appendShxGpuSegments(segments, nextScene, origin);
  return { segments: out.segments, scene: out.scene };
}

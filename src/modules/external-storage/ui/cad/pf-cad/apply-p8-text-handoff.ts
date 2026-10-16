import {
  P8_GPU_TEXT_HANDOFF_ENABLED,
} from './cad-gpu-text-policy';
import { appendShxGpuSegments } from './shx-text-segments';
import type { ScenePayload } from './types';

/** Merge SHX stroke segments into the WASM buffer after fonts are registered (P8). */
export function applyCadP8GpuTextHandoff(
  segments: Float32Array,
  scene: ScenePayload,
): { segments: Float32Array; scene: ScenePayload } {
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) {
    return { segments, scene };
  }
  const origin = scene.origin ?? [0, 0];
  const out = appendShxGpuSegments(segments, scene, origin);
  return { segments: out.segments, scene: out.scene };
}

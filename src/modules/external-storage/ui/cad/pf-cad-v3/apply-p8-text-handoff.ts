import { P8_GPU_TEXT_HANDOFF_ENABLED } from './cad-gpu-text-policy';
import {
  appendShxGpuSegments,
  sanitizeSceneGpuTextFlags,
  stripUpstreamClientShxGpuFlags,
} from './shx-text-segments';
import type { ScenePayload } from './types';

/** Merge SHX stroke segments into the WASM buffer after fonts are registered (P8). */
export function applyCadP8GpuTextHandoff(
  segments: Float32Array,
  scene: ScenePayload,
): { segments: Float32Array; scene: ScenePayload } {
  const origin = scene.origin ?? [0, 0];
  let nextScene = stripUpstreamClientShxGpuFlags(scene);
  if (!P8_GPU_TEXT_HANDOFF_ENABLED) {
    return { segments, scene: nextScene };
  }
  const out = appendShxGpuSegments(segments, nextScene, origin);
  const sceneFinal = sanitizeSceneGpuTextFlags(out.scene, origin);
  return { segments: out.segments, scene: sceneFinal };
}

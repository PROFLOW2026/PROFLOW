import { workerProgressSchema, workerResultSchema, type WorkerResult } from './contracts';

/**
 * JSON keys where Python `model_dump()` may emit `null` and the app must keep **null**
 * (required-nullable semantics), not coerce to `undefined`.
 */
const WIRE_PRESERVE_JSON_NULL_KEYS = new Set([
  'typeKey',
  'ratio',
  'metersPerPreviewPx',
  'previewArtifact',
  'angleDeg',
  'lengthMeters',
  'textBox',
  'template',
]);

/**
 * Coerce Python worker JSON for Zod: most Optional fields arrive as `null` but TS `.optional()`
 * expects absence. Required-nullables listed above stay `null`.
 */
export function coerceWorkerWireJson(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map(coerceWorkerWireJson);
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value)) {
      if (raw === null && WIRE_PRESERVE_JSON_NULL_KEYS.has(key)) {
        out[key] = null;
        continue;
      }
      out[key] = coerceWorkerWireJson(raw);
    }
    return out;
  }
  return value;
}

export function parseWorkerResultPayload(body: unknown): WorkerResult {
  return workerResultSchema.parse(coerceWorkerWireJson(body));
}

export function parseWorkerProgressPayload(body: unknown) {
  return workerProgressSchema.parse(coerceWorkerWireJson(body));
}
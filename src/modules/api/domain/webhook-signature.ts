import { createHmac, timingSafeEqual } from 'node:crypto';

import { hashSecret, isSha256HexDigest, secretsEqual } from './api-key';

/** Header carrying `t=<unix>,v1=<hex>` (Stripe-style). */
export const WEBHOOK_SIGNATURE_HEADER = 'X-ProjectFlow-Signature';

export const WEBHOOK_TIMESTAMP_HEADER = 'X-ProjectFlow-Timestamp';

export const WEBHOOK_EVENT_ID_HEADER = 'X-ProjectFlow-Event-Id';

/** Reject signatures outside this window (replay protection). */
export const DEFAULT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 300;

export function signWebhookPayload(
  plaintextSecret: string,
  body: string,
  timestampSeconds: number,
): string {
  const signedPayload = `${timestampSeconds}.${body}`;
  return createHmac('sha256', plaintextSecret).update(signedPayload, 'utf8').digest('hex');
}

export function formatWebhookSignatureHeader(timestampSeconds: number, signatureHex: string): string {
  return `t=${timestampSeconds},v1=${signatureHex}`;
}

export function parseWebhookSignatureHeader(header: string): {
  timestampSeconds: number;
  signatures: string[];
} | null {
  const parts = header.split(',').map((part) => part.trim());
  let timestampSeconds: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const value = rest.join('=');
    if (!key || !value) continue;
    if (key === 't') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return null;
      timestampSeconds = parsed;
    } else if (key === 'v1') {
      signatures.push(value.toLowerCase());
    }
  }

  if (timestampSeconds === null || signatures.length === 0) return null;
  return { timestampSeconds, signatures };
}

export function buildWebhookSignatureHeaders(input: {
  plaintextSecret: string;
  body: string;
  eventId: string;
  timestampSeconds?: number;
}): {
  timestampSeconds: number;
  signature: string;
  headers: Record<string, string>;
} {
  const timestampSeconds = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(input.plaintextSecret, input.body, timestampSeconds);
  return {
    timestampSeconds,
    signature,
    headers: {
      [WEBHOOK_SIGNATURE_HEADER]: formatWebhookSignatureHeader(timestampSeconds, signature),
      [WEBHOOK_TIMESTAMP_HEADER]: String(timestampSeconds),
      [WEBHOOK_EVENT_ID_HEADER]: input.eventId,
    },
  };
}

function signaturesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies an inbound webhook signature (consumer / test helper).
 * Enforces timestamp tolerance to limit replay windows.
 */
export function verifyWebhookSignature(input: {
  plaintextSecret: string;
  body: string;
  signatureHeader: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): boolean {
  const parsed = parseWebhookSignatureHeader(input.signatureHeader);
  if (!parsed) return false;

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? DEFAULT_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - parsed.timestampSeconds) > tolerance) return false;

  const expected = signWebhookPayload(
    input.plaintextSecret,
    input.body,
    parsed.timestampSeconds,
  );

  return parsed.signatures.some((candidate) => signaturesEqual(candidate, expected));
}

/** Confirms a presented webhook secret matches the stored SHA-256 digest. */
export function verifyWebhookSecretMatchesHash(
  plaintextSecret: string,
  secretHash: string,
): boolean {
  if (!isSha256HexDigest(secretHash)) return false;
  return secretsEqual(hashSecret(plaintextSecret), secretHash);
}

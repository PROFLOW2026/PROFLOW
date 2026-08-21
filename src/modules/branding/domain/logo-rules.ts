/**
 * Brand asset file rules — PNG / JPEG / WebP only. SVG forbidden.
 */

import { DomainRuleError } from '@/shared/errors';
import type { BrandAssetKind } from './types';

export const MAX_BRAND_ASSET_BYTES = 5 * 1024 * 1024;
export const MAX_BRAND_ASSET_DIMENSION = 4000;

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

const FORBIDDEN_MIME = new Set([
  'image/svg+xml',
  'image/svg',
  'text/xml',
  'application/xml',
  'application/svg+xml',
]);

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  webp: 'image/webp',
};

export function normalizeBrandAssetMime(
  reportedType: string | undefined | null,
  fileName: string,
): string {
  const ext = fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (ext === 'svg') {
    throw new DomainRuleError('SVG logos are not allowed', 'branding.errors.svgForbidden', {
      fileName,
    });
  }

  const reported = (reportedType ?? '').trim().toLowerCase();
  const aliased = MIME_ALIASES[reported] ?? reported;

  if (FORBIDDEN_MIME.has(aliased) || aliased.includes('svg')) {
    throw new DomainRuleError(
      'SVG logos are not allowed',
      'branding.errors.svgForbidden',
      { mimeType: aliased },
    );
  }

  if (aliased && ALLOWED_MIME.has(aliased)) return aliased;

  const inferred = EXT_TO_MIME[ext];
  if (inferred) return inferred;

  throw new DomainRuleError(
    'Only PNG, JPEG, and WebP images are allowed',
    'branding.errors.mimeNotAllowed',
    { mimeType: reported || null },
  );
}

export function assertBrandAssetConstraints(input: {
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  fileName?: string;
}): { mimeType: string } {
  const mimeType = normalizeBrandAssetMime(input.mimeType, input.fileName ?? 'file.png');

  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_BRAND_ASSET_BYTES) {
    throw new DomainRuleError(
      'Brand image must be between 1 byte and 5 MB',
      'branding.errors.fileTooLarge',
      { sizeBytes: input.sizeBytes, maxBytes: MAX_BRAND_ASSET_BYTES },
    );
  }

  if (input.width != null && (input.width < 1 || input.width > MAX_BRAND_ASSET_DIMENSION)) {
    throw new DomainRuleError(
      'Brand image width exceeds the maximum',
      'branding.errors.dimensionsTooLarge',
      { width: input.width, max: MAX_BRAND_ASSET_DIMENSION },
    );
  }
  if (input.height != null && (input.height < 1 || input.height > MAX_BRAND_ASSET_DIMENSION)) {
    throw new DomainRuleError(
      'Brand image height exceeds the maximum',
      'branding.errors.dimensionsTooLarge',
      { height: input.height, max: MAX_BRAND_ASSET_DIMENSION },
    );
  }

  return { mimeType };
}

export const BRAND_ASSET_KINDS: readonly BrandAssetKind[] = [
  'logo_primary',
  'logo_compact',
  'logo_dark',
  'logo_light',
  'signature',
  'stamp',
] as const;

export function isBrandAssetKind(value: string): value is BrandAssetKind {
  return (BRAND_ASSET_KINDS as readonly string[]).includes(value);
}

/**
 * Azure Hebrew / F0 capability documentation (Document Intelligence v4 / 2024-11-30).
 *
 * Official Microsoft language support (current):
 * - prebuilt-invoice: Hebrew (`he`) supported
 * - prebuilt-receipt: Hebrew (`he`) supported (thermal receipt languages)
 *
 * Therefore Hebrew extraction uses native prebuilt models first.
 * Hebrew must NOT depend on Query Fields.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  assertOcrFileLimits,
  resolveActiveOcrCapabilities,
} from '@/modules/ocr/domain/cost-controls';
import {
  AZURE_F0_MAX_FILE_BYTES,
  AZURE_F0_MAX_PAGES,
  isAzureQueryFieldsEnabled,
  resolveAzureCapabilities,
} from '@/modules/ocr/domain/provider-capabilities';
import { AZURE_HEBREW_LOCALE, AZURE_ISRAEL_QUERY_FIELDS } from '@/modules/ocr/domain/model-strategy';

describe('Azure Hebrew + F0/S0 capabilities', () => {
  const previous = {
    tier: process.env.OCR_AZURE_TIER,
    query: process.env.OCR_AZURE_QUERY_FIELDS,
  };

  afterEach(() => {
    if (previous.tier === undefined) delete process.env.OCR_AZURE_TIER;
    else process.env.OCR_AZURE_TIER = previous.tier;
    if (previous.query === undefined) delete process.env.OCR_AZURE_QUERY_FIELDS;
    else process.env.OCR_AZURE_QUERY_FIELDS = previous.query;
  });

  it('defaults to F0 limits (4MB / 2 pages) and disables queryFields', () => {
    delete process.env.OCR_AZURE_TIER;
    delete process.env.OCR_AZURE_QUERY_FIELDS;
    const caps = resolveAzureCapabilities();
    expect(caps.tier).toBe('F0');
    expect(caps.maxFileBytes).toBe(AZURE_F0_MAX_FILE_BYTES);
    expect(caps.maxPages).toBe(AZURE_F0_MAX_PAGES);
    expect(caps.queryFields).toBe(false);
    expect(caps.keyValuePairs).toBe(false);
    expect(caps.hebrewNativePrebuilt).toBe(true);
    expect(isAzureQueryFieldsEnabled()).toBe(false);
    expect(AZURE_HEBREW_LOCALE).toBe('he');
  });

  it('rejects F0 oversize and over-page before any provider call semantics', () => {
    process.env.OCR_AZURE_TIER = 'F0';
    const caps = resolveActiveOcrCapabilities('azure');
    expect(assertOcrFileLimits({ sizeBytes: 5 * 1024 * 1024, pageCount: 1 }, caps)).toEqual({
      ok: false,
      code: 'too_large',
    });
    expect(assertOcrFileLimits({ sizeBytes: 1000, pageCount: 3 }, caps)).toEqual({
      ok: false,
      code: 'too_many_pages',
    });
    expect(
      assertOcrFileLimits({ sizeBytes: 1000, pageCount: 2, mimeType: 'image/png' }, caps),
    ).toEqual({
      ok: true,
    });
  });

  it('enables queryFields capability only when S0 + OCR_AZURE_QUERY_FIELDS=true', () => {
    process.env.OCR_AZURE_TIER = 'S0';
    process.env.OCR_AZURE_QUERY_FIELDS = 'false';
    expect(resolveAzureCapabilities().queryFields).toBe(false);

    process.env.OCR_AZURE_QUERY_FIELDS = 'true';
    const caps = resolveAzureCapabilities();
    expect(caps.queryFields).toBe(true);
    expect(AZURE_ISRAEL_QUERY_FIELDS.length).toBeGreaterThan(0);
    expect(caps.queryFieldsCostNote).toMatch(/paid|add-on/i);
  });

  it('never enables queryFields on F0 even if env asks', () => {
    process.env.OCR_AZURE_TIER = 'F0';
    process.env.OCR_AZURE_QUERY_FIELDS = 'true';
    expect(isAzureQueryFieldsEnabled()).toBe(false);
    expect(resolveAzureCapabilities().queryFields).toBe(false);
  });
});

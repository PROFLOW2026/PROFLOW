import { describe, expect, it } from 'vitest';
import { classifyCapture } from '@/modules/quick-capture/domain/classify-capture';
import type { ClassifyCaptureInput } from '@/modules/quick-capture/domain/classify-capture';
import type { ExtractionJob } from '@/modules/ocr';

function baseInput(
  overrides: Partial<ClassifyCaptureInput> = {},
): ClassifyCaptureInput {
  return {
    sessionKind: 'images',
    documentCount: 1,
    mimeTypes: ['image/jpeg'],
    explicitProjectId: null,
    ownerNote: null,
    ocrJob: null,
    projectNames: [],
    ...overrides,
  };
}

function financialOcrJob(): ExtractionJob {
  return {
    status: 'needs_review',
    rawMetadata: { documentTypeKey: 'tax_invoice' },
    candidates: {
      vendor: { value: 'Acme Ltd', confidence: 0.9, provenance: { source: 'ocr' } },
      reference: { value: 'INV-1001', confidence: 0.9, provenance: { source: 'ocr' } },
      gross: { value: '1180.00', confidence: 0.9, provenance: { source: 'ocr' } },
    },
  } as ExtractionJob;
}

describe('classifyCapture', () => {
  it('classifies video sessions as field_media', () => {
    const result = classifyCapture(
      baseInput({
        sessionKind: 'video',
        documentCount: 1,
        mimeTypes: ['video/webm'],
      }),
    );

    expect(result.detectedType).toBe('field_media');
    expect(result.detectionConfidence).toBe('suggested');
  });

  it('classifies video mime even when sessionKind is not video', () => {
    const result = classifyCapture(
      baseInput({
        sessionKind: 'file',
        documentCount: 1,
        mimeTypes: ['video/mp4'],
      }),
    );

    expect(result.detectedType).toBe('field_media');
  });

  it('never classifies video as financial_document even with strong OCR', () => {
    const result = classifyCapture(
      baseInput({
        sessionKind: 'video',
        documentCount: 1,
        mimeTypes: ['video/quicktime'],
        ocrJob: financialOcrJob(),
      }),
    );

    expect(result.detectedType).toBe('field_media');
    expect(result.detectedType).not.toBe('financial_document');
  });

  it('still allows financial_document for single-image OCR success', () => {
    const result = classifyCapture(
      baseInput({
        sessionKind: 'images',
        documentCount: 1,
        mimeTypes: ['image/jpeg'],
        ocrJob: financialOcrJob(),
      }),
    );

    expect(result.detectedType).toBe('financial_document');
  });
});

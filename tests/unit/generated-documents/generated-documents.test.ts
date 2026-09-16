import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { latestCompletedMonth } from '@/modules/command-center/data/collect-monthly-workforce-report';
import { buildGeneratedPdfFileName } from '@/modules/generated-documents/domain/filenames';
import {
  generatedArtifactKey,
  parseGeneratedDocumentTags,
  serializeGeneratedDocumentTags,
} from '@/modules/generated-documents/domain/tags';

describe('generated documents', () => {
  it('latestCompletedMonth returns previous calendar month', () => {
    expect(latestCompletedMonth(businessDate('2026-09-16'))).toBe('2026-08');
    expect(latestCompletedMonth(businessDate('2026-01-05'))).toBe('2025-12');
  });

  it('builds monthly workforce filename with version suffix', () => {
    expect(buildGeneratedPdfFileName({
      kind: 'monthly_workforce_report',
      version: 1,
      reportMonth: '2026-09',
    })).toBe('דוח-עובדים-2026-09.pdf');

    expect(buildGeneratedPdfFileName({
      kind: 'monthly_workforce_report',
      version: 2,
      reportMonth: '2026-09',
    })).toContain('גרסה 2');
  });

  it('serializes and parses generated document tags', () => {
    const raw = serializeGeneratedDocumentTags({
      pfGenerated: true,
      generatedKind: 'quote_estimate',
      sourceEntityType: 'quote',
      sourceEntityId: 'abc',
      version: 1,
      generatedAt: '2026-09-16T10:00:00.000Z',
    });
    const parsed = parseGeneratedDocumentTags(raw);
    expect(parsed?.generatedKind).toBe('quote_estimate');
    expect(parsed?.sourceEntityId).toBe('abc');
  });

  it('dedupes artifact keys by month for workforce reports', () => {
    expect(
      generatedArtifactKey({
        generatedKind: 'monthly_workforce_report',
        sourceEntityId: 'org-id',
        reportMonth: '2026-08',
      }),
    ).toBe('monthly_workforce_report:2026-08');
  });
});

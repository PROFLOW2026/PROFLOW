import { describe, expect, it } from 'vitest';

import { resolveAnnotatedExportTarget } from '@/modules/electrical-takeoff/application/export-download';

describe('resolveAnnotatedExportTarget', () => {
  it('prefers paired non-legend plan PDF and filters detections by file', () => {
    const files = [
      {
        id: 'leg',
        name: '7155-A1-מקרא.pdf',
        kind: 'pdf' as const,
        uploadState: 'complete' as const,
        sizeBytes: 1,
        organizationId: 'o',
        projectId: 'p',
        analysisId: 'a',
        sha256: null,
        storageDocumentId: null,
        createdAt: new Date(),
      },
      {
        id: 'plan',
        name: '7155-A1-תאורה ג.pdf',
        kind: 'pdf' as const,
        uploadState: 'complete' as const,
        sizeBytes: 1,
        organizationId: 'o',
        projectId: 'p',
        analysisId: 'a',
        sha256: null,
        storageDocumentId: null,
        createdAt: new Date(),
      },
    ];
    const sheets = [
      {
        fileId: 'leg',
        sheetKey: 'p1',
        name: 'מקרא',
        kind: 'pdf_page' as const,
        index: 0,
        widthPx: 100,
        heightPx: 100,
        scale: null,
        analyzed: true,
        floorHint: null,
        previewArtifact: null,
        xrefsMissing: [],
        hiddenByLayers: 0,
      },
      {
        fileId: 'plan',
        sheetKey: 'p1',
        name: 'תאורה',
        kind: 'pdf_page' as const,
        index: 0,
        widthPx: 100,
        heightPx: 100,
        scale: null,
        analyzed: true,
        floorHint: null,
        previewArtifact: null,
        xrefsMissing: [],
        hiddenByLayers: 0,
      },
    ];
    const detections = [
      {
        id: 'p1#a',
        sheetKey: 'p1',
        x: 1,
        y: 2,
        w: 3,
        h: 4,
        typeKey: 'light',
        origin: 'auto' as const,
        status: 'suggested' as const,
        confidence: 'high' as const,
        reasons: [],
        rawClass: '',
        tagText: null,
        source: 'dwg' as const,
        areaId: null,
        needsReview: false,
      },
      {
        id: 'p1#b',
        sheetKey: 'p1',
        x: 5,
        y: 6,
        w: 3,
        h: 4,
        typeKey: 'light',
        origin: 'auto' as const,
        status: 'suggested' as const,
        confidence: 'medium' as const,
        reasons: [],
        rawClass: '',
        tagText: null,
        source: 'pdf' as const,
        areaId: null,
        needsReview: false,
      },
    ];
    const fileMap = new Map([
      ['p1#a', 'plan'],
      ['p1#b', 'leg'],
    ]);
    const target = resolveAnnotatedExportTarget(
      files as never,
      sheets as never,
      { pairing: [{ pdfFileId: 'plan', dwgFileId: 'dwg' }] },
      detections,
      fileMap,
    );
    expect(target?.pdf.id).toBe('plan');
    expect(target?.overlayDetections.map((d) => d.id)).toEqual(['p1#a']);
  });
});
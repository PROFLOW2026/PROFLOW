import { describe, expect, it, vi } from 'vitest';
import { attachSheetPreviewUrls } from '@/modules/electrical-takeoff/application/resolve-sheet-previews';
import * as repo from '@/modules/electrical-takeoff/data/takeoff.repository';
import type { SheetDto } from '@/modules/electrical-takeoff/domain/contracts';

describe('attachSheetPreviewUrls', () => {
  it('maps artifact names to download URLs', async () => {
    vi.spyOn(repo, 'listArtifactsForJob').mockResolvedValue([
      {
        id: 'art-1',
        name: 'preview-page-1.png',
        jobId: 'job-1',
        organizationId: 'org-1',
        mimeType: 'image/png',
        sizeBytes: 1,
        storageKey: 'k',
        sha256: 'h',
        createdAt: new Date(),
      } as never,
    ]);
    const sheets: SheetDto[] = [
      {
        sheetKey: 'p0',
        fileId: 'f1',
        name: 'Page 1',
        kind: 'pdf_page',
        index: 0,
        widthPx: 100,
        heightPx: 100,
        previewUrl: 'preview-page-1.png',
        floorLabel: null,
        scale: { ratio: null, metersPerPreviewPx: null, verified: false, source: 'none' },
        analyzed: 'full',
        xrefsMissing: [],
        hiddenByLayers: 0,
      },
    ];
    const out = await attachSheetPreviewUrls({} as never, 'org-1', 'job-1', sheets);
    expect(out[0]?.previewUrl).toBe('/api/takeoff/artifact/art-1');
    vi.restoreAllMocks();
  });
});
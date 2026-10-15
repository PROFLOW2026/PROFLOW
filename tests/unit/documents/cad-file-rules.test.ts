import { describe, expect, it } from 'vitest';
import {
  cadMimeTypeFromFileName,
  inferCadPreviewKind,
  isStorageCadPreviewable,
} from '@/modules/documents/domain/cad-file-rules';
import { normalizeUploadMime } from '@/modules/documents/domain/file-rules';

describe('cad file rules', () => {
  it('detects CAD kinds by extension', () => {
    expect(inferCadPreviewKind('plan.dwg')).toBe('dwg');
    expect(inferCadPreviewKind('sheet.dwf')).toBe('dwf');
    expect(inferCadPreviewKind('bundle.dwfx')).toBe('dwfx');
    expect(inferCadPreviewKind('export.dxf')).toBe('dxf');
    expect(inferCadPreviewKind('notes.pdf')).toBeNull();
  });

  it('marks storage CAD files as previewable', () => {
    expect(isStorageCadPreviewable('a.DWG')).toBe(true);
    expect(isStorageCadPreviewable('scan.jpg')).toBe(false);
  });

  it('maps CAD extensions to MIME for upload normalization', () => {
    expect(cadMimeTypeFromFileName('x.dwg')).toBe('image/vnd.dwg');
    expect(normalizeUploadMime('application/octet-stream', 'floor.dxf')).toEqual({
      ok: true,
      mimeType: 'image/vnd.dxf',
      inferredFromExtension: true,
    });
    expect(normalizeUploadMime('', 'layout.dwfx')).toEqual({
      ok: true,
      mimeType: 'model/vnd.dwfx',
      inferredFromExtension: true,
    });
  });
});

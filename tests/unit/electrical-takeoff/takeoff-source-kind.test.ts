import { describe, expect, it } from 'vitest';

import { isAllowedMimeType } from '@/modules/documents/domain/file-rules';
import {
  inferTakeoffSourceKind,
  takeoffLinkedDocumentMime,
} from '@/modules/electrical-takeoff/application/takeoff-source-kind';

describe('inferTakeoffSourceKind', () => {
  it('detects pdf, dwg, dxf by extension', () => {
    expect(inferTakeoffSourceKind('plan.pdf', 'application/pdf')).toBe('pdf');
    expect(inferTakeoffSourceKind('A1.dwg', 'application/octet-stream')).toBe('dwg');
    expect(inferTakeoffSourceKind('x.dxf', 'text/plain')).toBe('dxf');
    expect(inferTakeoffSourceKind('readme.txt', 'text/plain')).toBeNull();
  });

  it('stores an allowed document type when the cloud reports a generic or unknown DWG type', () => {
    const fromOctet = takeoffLinkedDocumentMime('E-1-ELC.dwg', 'application/octet-stream', 'dwg');
    const fromUnknown = takeoffLinkedDocumentMime('E-1-ELC.dwg', 'application/x-dwg', 'dwg');
    const fromDxf = takeoffLinkedDocumentMime('sheet.dxf', 'text/plain', 'dxf');
    const fromPdf = takeoffLinkedDocumentMime('plan.pdf', 'application/pdf', 'pdf');

    expect(fromOctet).toBe('image/vnd.dwg');
    expect(fromUnknown).toBe('image/vnd.dwg');
    expect(fromDxf).toBe('image/vnd.dxf');
    expect(fromPdf).toBe('application/pdf');
    for (const mime of [fromOctet, fromUnknown, fromDxf, fromPdf]) {
      expect(isAllowedMimeType(mime)).toBe(true);
    }
  });
});

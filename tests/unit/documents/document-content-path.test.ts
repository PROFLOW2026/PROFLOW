import { describe, expect, it } from 'vitest';
import {
  buildDocumentContentPath,
  isCrossOriginDocumentPreviewUrl,
} from '@/modules/documents/domain/content-path';

describe('document content path', () => {
  it('builds same-origin inline and attachment routes', () => {
    const documentId = '133ba781-95cc-494c-874d-57f5329af863';
    expect(buildDocumentContentPath(documentId)).toBe(
      `/api/org-storage/download/${documentId}?disposition=inline`,
    );
    expect(buildDocumentContentPath(documentId, 'attachment')).toBe(
      `/api/org-storage/download/${documentId}?disposition=attachment`,
    );
  });

  it('flags cross-origin provider URLs for pdf.js preview', () => {
    expect(isCrossOriginDocumentPreviewUrl('/api/org-storage/download/doc-1?disposition=inline')).toBe(
      false,
    );
    expect(
      isCrossOriginDocumentPreviewUrl('https://dl.dropboxusercontent.com/s/abc/file.pdf'),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  authorizedPreviewKind,
  isExplicitAttachmentRequest,
  resolveAuthorizedPreviewMime,
} from '@/modules/external-storage/domain/authorized-preview';
import { contractorFolderFileContentUrl, withExplicitAttachment } from '@/modules/contractor-portal/download-paths';

describe('authorized preview kind', () => {
  it('opens DWG through the CAD viewer even when the provider MIME is generic', () => {
    expect(authorizedPreviewKind('plan.dwg', 'application/octet-stream')).toBe('dwg');
    expect(resolveAuthorizedPreviewMime('plan.dwg', 'application/octet-stream')).toBe('image/vnd.dwg');
  });

  it('keeps PDF and images on their existing viewers', () => {
    expect(authorizedPreviewKind('sheet.pdf', 'application/octet-stream')).toBe('pdf');
    expect(authorizedPreviewKind('photo.jpg', 'image/jpeg')).toBe('image');
  });

  it('does not claim a viewer for Office files', () => {
    expect(authorizedPreviewKind('note.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(
      'unsupported',
    );
  });

  it('marks only an explicit attachment query as a download', () => {
    expect(isExplicitAttachmentRequest(null)).toBe(false);
    expect(isExplicitAttachmentRequest('inline')).toBe(false);
    expect(isExplicitAttachmentRequest('attachment')).toBe(true);
  });

  it('builds a view URL and a separate download URL for the same contractor file', () => {
    const contentUrl = contractorFolderFileContentUrl({
      organizationId: 'org',
      projectId: 'project',
      folder: 'plans',
      externalFileId: 'file-1',
    });
    expect(contentUrl.startsWith('/api/contractor/dg-files/download/folder-file?')).toBe(true);
    expect(contentUrl.includes('disposition=attachment')).toBe(false);
    const downloadUrl = withExplicitAttachment(contentUrl);
    expect(downloadUrl.includes('disposition=attachment')).toBe(true);
    expect(downloadUrl.includes('externalFileId=file-1')).toBe(true);
  });
});

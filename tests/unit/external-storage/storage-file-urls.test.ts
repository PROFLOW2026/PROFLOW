import { describe, expect, it } from 'vitest';
import { buildStorageFileDownloadUrl } from '@/modules/external-storage/client/storage-file-urls';

describe('buildStorageFileDownloadUrl', () => {
  it('defaults preview requests to inline disposition', () => {
    const url = buildStorageFileDownloadUrl({
      scope: 'project',
      projectId: 'proj-1',
      fileId: 'file-1',
    });
    expect(url).toContain('disposition=inline');
  });

  it('uses attachment for open-on-device', () => {
    const url = buildStorageFileDownloadUrl({
      scope: 'project',
      projectId: 'proj-1',
      fileId: 'file-1',
      disposition: 'attachment',
    });
    expect(url).toContain('disposition=attachment');
  });

  it('includes org scope without project id', () => {
    const url = buildStorageFileDownloadUrl({
      scope: 'org',
      fileId: 'file-1',
      disposition: 'inline',
    });
    expect(url).toContain('scope=org');
    expect(url).not.toContain('projectId');
  });
});

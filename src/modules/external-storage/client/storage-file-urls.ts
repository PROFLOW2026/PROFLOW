export type StorageBrowserScope = 'project' | 'org';

export function buildStorageFileDownloadUrl(input: {
  scope: StorageBrowserScope;
  fileId: string;
  projectId?: string;
  disposition?: 'inline' | 'attachment';
}): string {
  const params = new URLSearchParams({
    scope: input.scope,
    fileId: input.fileId,
    disposition: input.disposition ?? 'inline',
  });
  if (input.scope === 'project' && input.projectId) {
    params.set('projectId', input.projectId);
  }
  return `/api/org-storage/browser-download?${params.toString()}`;
}

export function buildStorageProviderUrlRequest(input: {
  scope: StorageBrowserScope;
  fileId: string;
  projectId?: string;
}): string {
  const params = new URLSearchParams({
    scope: input.scope,
    fileId: input.fileId,
  });
  if (input.scope === 'project' && input.projectId) {
    params.set('projectId', input.projectId);
  }
  return `/api/org-storage/browser-provider-url?${params.toString()}`;
}

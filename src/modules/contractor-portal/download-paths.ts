/** Browser-safe contractor folder file stream URL (query params carry ids). */
export const CONTRACTOR_FOLDER_FILE_DOWNLOAD_PATH = '/api/contractor/dg-files/download/folder-file';

export function contractorFolderFileContentUrl(input: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly folder: string;
  readonly externalFileId: string;
}): string {
  return `${CONTRACTOR_FOLDER_FILE_DOWNLOAD_PATH}?${new URLSearchParams({
    organizationId: input.organizationId,
    projectId: input.projectId,
    folder: input.folder,
    externalFileId: input.externalFileId,
  }).toString()}`;
}

/** Same authorized stream, with an explicit attachment request for the separate download action. */
export function withExplicitAttachment(contentUrl: string): string {
  const url = new URL(contentUrl, 'http://projectflow.local');
  url.searchParams.set('disposition', 'attachment');
  return `${url.pathname}${url.search}`;
}

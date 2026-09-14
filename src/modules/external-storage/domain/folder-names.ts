/** Sanitize entity names for cloud provider folder creation (OneDrive forbids " \\ / : * ? < > |). */
export function sanitizeProviderFolderName(name: string): string {
  const sanitized = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return sanitized.length > 0 ? sanitized : 'Folder';
}

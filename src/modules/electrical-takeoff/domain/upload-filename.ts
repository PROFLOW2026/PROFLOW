/** Cross-platform basename for stored upload display names (POSIX + Windows separators). */
export function sanitizeTakeoffUploadFilename(name: string): string {
  const basename = name.replaceAll('\\', '/').split('/').filter(Boolean).pop() ?? '';
  return basename.replaceAll(/[/\\<>:"|?*]/g, '_');
}
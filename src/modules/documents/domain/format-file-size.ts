type FileSizeUnitKey = 'bytes' | 'kilobytes' | 'megabytes';

export function formatFileSize(
  bytes: number | null,
  t: (key: FileSizeUnitKey, values: { size: string }) => string,
): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return t('bytes', { size: String(bytes) });
  if (bytes < 1024 * 1024) return t('kilobytes', { size: (bytes / 1024).toFixed(1) });
  return t('megabytes', { size: (bytes / (1024 * 1024)).toFixed(1) });
}

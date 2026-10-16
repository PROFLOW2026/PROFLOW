/** MIME for raster refs embedded in DWG (storage blob URLs). */
export function cadRasterMimeFromPath(filePath: string): string {
  const lower = filePath.trim().toLowerCase();
  if (/\.jpe?g$/i.test(lower)) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (/\.tif?f$/i.test(lower)) return 'image/tiff';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'image/png';
}

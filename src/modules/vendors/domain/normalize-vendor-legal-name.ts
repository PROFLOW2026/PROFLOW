/** Collapse common Hebrew legal suffixes for alias grouping (display scope only). */
export function normalizeVendorLegalNameForAlias(name: string): string {
  return name
    .replace(/\s*בע[״"']?מ\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

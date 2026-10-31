/** Collapse common Hebrew legal suffixes (utility only — not used for financial vendor aggregation). */
export function normalizeVendorLegalNameForAlias(name: string): string {
  return name
    .replace(/\s*בע[״"']?מ\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

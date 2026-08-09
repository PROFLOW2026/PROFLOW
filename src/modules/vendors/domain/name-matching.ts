/**
 * Normalizes supplier names for duplicate detection when promoting from expenses.
 */

export function normalizeVendorName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

export function vendorNamesMatch(a: string, b: string): boolean {
  return normalizeVendorName(a) === normalizeVendorName(b);
}

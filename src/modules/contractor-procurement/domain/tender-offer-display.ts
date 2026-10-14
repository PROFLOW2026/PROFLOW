/** Display label for a tender offer vendor (never a truncated UUID). */
export function tenderOfferVendorLabel(
  vendorNames: ReadonlyMap<string, string>,
  vendorId: string,
  unknownLabel = '—',
): string {
  const name = vendorNames.get(vendorId)?.trim();
  return name && name.length > 0 ? name : unknownLabel;
}

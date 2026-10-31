export function canonicalVendorIdFromMap(
  map: ReadonlyMap<string, string>,
  vendorId: string,
): string {
  return map.get(vendorId) ?? vendorId;
}

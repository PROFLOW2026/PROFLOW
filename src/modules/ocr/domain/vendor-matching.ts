import { normalizeVendorName } from '@/modules/vendors/domain/name-matching';
import { normalizeIsraeliIdentifier } from './israeli-normalize';
import type { OcrVendorMatch } from './types';

export interface VendorMatchIndexRow {
  readonly id: string;
  readonly name: string;
  readonly identifiers: readonly string[];
}

export function matchVendors(input: {
  vendorName: string | null;
  companyNumber: string | null;
  vatId: string | null;
  vendors: readonly VendorMatchIndexRow[];
}): OcrVendorMatch[] {
  const identifier = normalizeIsraeliIdentifier(input.companyNumber) ?? normalizeIsraeliIdentifier(input.vatId);
  if (identifier) {
    const hits = input.vendors.filter((vendor) =>
      vendor.identifiers.some((value) => normalizeIsraeliIdentifier(value) === identifier),
    );
    if (hits.length > 0) {
      return hits.map((vendor) => ({
        vendorId: vendor.id,
        vendorName: vendor.name,
        strength: 'exact_identifier' as const,
        reasonKey: 'identifier' as const,
      }));
    }
  }

  const needle = input.vendorName?.trim() ? normalizeVendorName(input.vendorName) : '';
  if (!needle) return [];

  const exact = input.vendors.filter((vendor) => normalizeVendorName(vendor.name) === needle);
  if (exact.length > 0) {
    return exact.map((vendor) => ({
      vendorId: vendor.id,
      vendorName: vendor.name,
      strength: 'exact_name' as const,
      reasonKey: 'exactName' as const,
    }));
  }

  const probable = input.vendors.filter((vendor) => {
    const name = normalizeVendorName(vendor.name);
    return name.includes(needle) || needle.includes(name);
  });
  return probable.slice(0, 5).map((vendor) => ({
    vendorId: vendor.id,
    vendorName: vendor.name,
    strength: 'probable_name' as const,
    reasonKey: 'probableName' as const,
  }));
}

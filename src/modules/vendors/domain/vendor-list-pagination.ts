export const VENDOR_LIST_PAGE_SIZES = [10, 20, 50] as const;
export type VendorListPageSize = (typeof VENDOR_LIST_PAGE_SIZES)[number];

export const VENDOR_LIST_DEFAULT_PAGE_SIZE: VendorListPageSize = 20;

export function parseVendorListPageSize(
  raw: string | undefined,
  defaultSize: VendorListPageSize = VENDOR_LIST_DEFAULT_PAGE_SIZE,
): VendorListPageSize {
  const parsed = parseInt(raw ?? '', 10);
  if (parsed === 10 || parsed === 20 || parsed === 50) return parsed;
  return defaultSize;
}

export function vendorListPageCount(total: number, pageSize: number): number {
  const size = Math.max(1, pageSize);
  if (total <= 0) return 0;
  return Math.ceil(total / size);
}

export function resolveVendorListPage(
  total: number,
  requestedPage: number,
  pageSize: number,
): number {
  const count = vendorListPageCount(total, pageSize);
  if (count === 0) return 1;
  return Math.min(Math.max(1, requestedPage), count);
}

export function vendorListOffset(page: number, pageSize: number): number {
  return Math.max(0, (Math.max(1, page) - 1) * pageSize);
}

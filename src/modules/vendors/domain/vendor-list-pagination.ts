export {
  MAIN_APP_LIST_PAGE_SIZES as VENDOR_LIST_PAGE_SIZES,
  MAIN_APP_DEFAULT_LIST_PAGE_SIZE as VENDOR_LIST_DEFAULT_PAGE_SIZE,
  parseMainAppListPageSize as parseVendorListPageSize,
  type MainAppListPageSize as VendorListPageSize,
} from '@/shared/db/main-app-list-page-size';

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

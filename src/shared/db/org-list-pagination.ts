import { ORG_LIST_PAGE_SIZE } from './list-limits';

export { ORG_LIST_PAGE_SIZE };

export function orgListPageCount(total: number, pageSize = ORG_LIST_PAGE_SIZE): number {
  const size = Math.max(1, pageSize);
  if (total <= 0) return 0;
  return Math.ceil(total / size);
}

/** Clamp out-of-range page requests safely (1-based). */
export function resolveOrgListPage(
  total: number,
  requestedPage: number,
  pageSize = ORG_LIST_PAGE_SIZE,
): number {
  const count = orgListPageCount(total, pageSize);
  if (count === 0) return 1;
  return Math.min(Math.max(1, requestedPage), count);
}

export function orgListOffset(page: number, pageSize = ORG_LIST_PAGE_SIZE): number {
  return Math.max(0, (Math.max(1, page) - 1) * pageSize);
}

export function parseOrgListPage(raw: string | undefined): number {
  const parsed = parseInt(raw ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

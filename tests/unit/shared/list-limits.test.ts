import { describe, expect, it } from 'vitest';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  ORG_LIST_PAGE_SIZE,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';

describe('list-limits', () => {
  it('defaults to the org list page size', () => {
    expect(resolveListLimit(undefined)).toBe(ORG_LIST_PAGE_SIZE);
  });

  it('caps at the hard limit unless an export-sized request raises the ceiling', () => {
    expect(resolveListLimit(10_000)).toBe(ORG_LIST_HARD_CAP);
    expect(resolveListLimit(10_000, { hardCap: ORG_LIST_EXPORT_CAP })).toBe(ORG_LIST_EXPORT_CAP);
  });

  it('normalizes offset', () => {
    expect(resolveListOffset(undefined)).toBe(0);
    expect(resolveListOffset(-3)).toBe(0);
    expect(resolveListOffset(12.9)).toBe(12);
  });
});

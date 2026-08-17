import { describe, expect, it } from 'vitest';
import { GLOBAL_SEARCH_KINDS } from '@/modules/search/domain/types';
import { globalSearchSchema } from '@/modules/search/validation/schemas';
import {
  assetSearchHref,
  calendarEventSearchHref,
  closeoutSearchHref,
  communicationSearchHref,
  inventoryItemSearchHref,
  materialSearchHref,
  warrantySearchHref,
  workEntityHref,
} from '@/modules/search/domain/hrefs';

describe('global search validation', () => {
  it('requires at least 2 characters', () => {
    expect(globalSearchSchema.safeParse({ query: 'a' }).success).toBe(false);
    expect(globalSearchSchema.safeParse({ query: 'ab' }).success).toBe(true);
  });

  it('covers expected entity kinds', () => {
    expect(GLOBAL_SEARCH_KINDS).toEqual(
      expect.arrayContaining([
        'project',
        'job',
        'work_order',
        'client',
        'contact',
        'employee',
        'vendor',
        'bill',
        'vendor_credit',
        'billing',
        'expense',
        'quote',
        'opportunity',
        'contract',
        'purchase_order',
        'subcontract',
        'document',
        'asset',
        'inventory_item',
        'material',
        'boq_item',
        'daily_log',
        'punch',
        'inspection',
        'safety',
        'warranty',
        'communication',
        'calendar_event',
        'closeout',
      ]),
    );
  });

  it('points asset hits at /assets/{id}, not the inventory list', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(assetSearchHref(id)).toBe(`/assets/${id}`);
    expect(assetSearchHref(id)).not.toBe('/assets/inventory');
    expect(inventoryItemSearchHref(id)).toBe(`/assets/inventory/${id}`);
    expect(materialSearchHref(id)).toBe(`/procurement/materials/${id}`);
  });

  it('points next-gen hits at existing product routes without profit/actual', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const projectId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(warrantySearchHref(id, projectId)).toBe(`/projects/${projectId}?tab=warranty`);
    expect(communicationSearchHref(id)).toBe(`/communications/${id}`);
    expect(calendarEventSearchHref(id)).toBe(`/calendar?event=${id}`);
    expect(closeoutSearchHref(projectId)).toBe(`/projects/${projectId}?tab=closeout`);
    expect(workEntityHref('job', id)).toBe(`/jobs/${id}`);
    expect(workEntityHref('work_order', id)).toBe(`/work-orders/${id}`);
    expect(workEntityHref('project', id)).toBe(`/projects/${id}`);
  });
});

import { describe, expect, it } from 'vitest';
import {
  isWarrantyWorkOrderKind,
  mayCreateWarrantyWorkOrderWhileClosed,
  originalProjectStatusAfterWarrantyWorkOrder,
} from '@/modules/warranty';

describe('warranty work-order link', () => {
  it('links a service work order without reopening the original project', () => {
    expect(mayCreateWarrantyWorkOrderWhileClosed('completed')).toBe(true);
    expect(originalProjectStatusAfterWarrantyWorkOrder('completed')).toBe('completed');
    expect(isWarrantyWorkOrderKind('work_order')).toBe(true);
    expect(isWarrantyWorkOrderKind('project')).toBe(false);
  });

  it('keeps an active original project unchanged as well', () => {
    expect(originalProjectStatusAfterWarrantyWorkOrder('active')).toBe('active');
  });
});

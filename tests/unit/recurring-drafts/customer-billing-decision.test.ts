import { describe, expect, it } from 'vitest';
import {
  AUTO_GENERATED_DRAFT_KINDS,
  CUSTOMER_RECURRING_BILLING_DECISION,
} from '@/modules/recurring-drafts/domain/customer-billing';

describe('recurring customer billing', () => {
  it('stays closed: progress billing is the contractor model, and auto-generation is expenses only', () => {
    expect(CUSTOMER_RECURRING_BILLING_DECISION).toBe('closed_by_design');
    expect(AUTO_GENERATED_DRAFT_KINDS).toEqual(['expense']);
    expect(AUTO_GENERATED_DRAFT_KINDS).not.toContain('billing_record');
  });
});

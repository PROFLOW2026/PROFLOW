import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { commitClosedMonthSourceEdit, retainBusinessDate } from '@/shared/business-change/assert-owner-retroactive';

const businessDate = '2026-03-12';
const updatedAt = new Date('2026-11-08T12:00:00.000Z');

describe('owner closed-month source edit', () => {
  it('lets the owner proceed after acknowledgement and keeps the business date', () => {
    let wrote = false;
    const persisted = commitClosedMonthSourceEdit({
      monthStatus: 'closed',
      isOwner: true,
      changeAcknowledged: true,
      businessDate,
      updatedAt,
      write(date) {
        wrote = true;
        return date;
      },
    });
    expect(wrote).toBe(true);
    expect(persisted).toBe(businessDate);
    expect(persisted).not.toBe(updatedAt.toISOString().slice(0, 10));
  });

  it('rejects the owner before write when acknowledgement is missing', () => {
    let wrote = false;
    expect(() =>
      commitClosedMonthSourceEdit({
        monthStatus: 'closed',
        isOwner: true,
        changeAcknowledged: undefined,
        businessDate,
        updatedAt,
        write() {
          wrote = true;
          return businessDate;
        },
      }),
    ).toThrow(ValidationError);
    expect(wrote).toBe(false);
  });

  it('rejects a non-owner before write with the Hebrew closed-period error', () => {
    let wrote = false;
    try {
      commitClosedMonthSourceEdit({
        monthStatus: 'closed',
        isOwner: false,
        changeAcknowledged: true,
        businessDate,
        updatedAt,
        write() {
          wrote = true;
          return businessDate;
        },
      });
      throw new Error('expected rejection');
    } catch (error) {
      expect(wrote).toBe(false);
      expect(error).toMatchObject({
        messageKey: 'monthClose.errors.useCorrectionNotRewrite',
      });
    }
  });

  it('does not replace the business date with updated_at', () => {
    expect(retainBusinessDate(businessDate, updatedAt)).toBe('2026-03-12');
    expect(retainBusinessDate(businessDate, updatedAt.toISOString())).toBe('2026-03-12');
  });

  it('does not lock a ready month', () => {
    const persisted = commitClosedMonthSourceEdit({
      monthStatus: 'ready',
      isOwner: false,
      changeAcknowledged: undefined,
      businessDate,
      updatedAt,
      write: (date) => date,
    });
    expect(persisted).toBe(businessDate);
  });

  it('does not treat service_role as the organization owner', () => {
    expect(isOrganizationOwner({ roleKeys: ['service_role'] } as unknown as OrgContext)).toBe(false);
    expect(isOrganizationOwner({ roleKeys: ['owner'] } as unknown as OrgContext)).toBe(true);
  });
});

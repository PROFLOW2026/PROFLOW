import { describe, expect, it } from 'vitest';
import {
  deriveEmployeeAccessStatusView,
  hasActiveTempPinWindow,
  hasPersonalPinSet,
} from '@/modules/employee-app/domain/access-status';
import type { EmployeeAppAccountRecord } from '@/modules/employee-app/domain/types';

function account(partial: Partial<EmployeeAppAccountRecord>): EmployeeAppAccountRecord {
  return {
    id: 'acc-1',
    organizationId: 'org-1',
    employeeId: 'emp-1',
    userId: 'user-1',
    username: '2485',
    usernameNormalized: '2485',
    status: 'invited',
    pinMustChange: true,
    temporaryPinExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    firstLoginAt: null,
    lastLoginAt: null,
    authEmail: '2485.employees.pf.internal',
    accessStartsAt: null,
    accessEndsAt: null,
    disabledAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
    ...partial,
  };
}

describe('access-status', () => {
  it('maps invited status with awaiting-first-login hint', () => {
    const view = deriveEmployeeAccessStatusView(account({ status: 'invited' }));
    expect(view.statusKey).toBe('invited');
    expect(view.hintKey).toBe('awaitingFirstLogin');
  });

  it('detects active temporary PIN window', () => {
    expect(
      hasActiveTempPinWindow(
        account({
          pinMustChange: true,
          temporaryPinExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        }),
      ),
    ).toBe(true);
    expect(
      hasActiveTempPinWindow(
        account({
          pinMustChange: false,
          temporaryPinExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
        }),
      ),
    ).toBe(false);
  });

  it('detects personal PIN after first login', () => {
    expect(
      hasPersonalPinSet(
        account({
          firstLoginAt: new Date(),
          pinMustChange: false,
        }),
      ),
    ).toBe(true);
  });
});

import { describe, expect, it, beforeEach } from 'vitest';
import {
  employeeLoginIsThrottled,
  MAX_EMPLOYEE_IP_FAILURES,
  MAX_EMPLOYEE_USERNAME_FAILURES,
  recordEmployeeLoginFailure,
  resetEmployeeLoginThrottle,
} from '@/modules/employee-app/domain/login-throttle';

describe('employee login throttle', () => {
  beforeEach(() => {
    resetEmployeeLoginThrottle();
  });

  it('throttles unknown usernames the same as known ones', () => {
    const now = Date.parse('2026-10-18T00:00:00.000Z');
    for (let attempt = 0; attempt < MAX_EMPLOYEE_USERNAME_FAILURES; attempt += 1) {
      expect(employeeLoginIsThrottled({ username: 'nobody', ip: '203.0.113.8', now })).toBe(false);
      recordEmployeeLoginFailure({ username: 'nobody', ip: '203.0.113.8', now });
    }
    expect(employeeLoginIsThrottled({ username: 'nobody', ip: '203.0.113.9', now })).toBe(true);
  });

  it('throttles an IP that sprays many usernames', () => {
    const now = Date.parse('2026-10-18T00:00:00.000Z');
    for (let attempt = 0; attempt < MAX_EMPLOYEE_IP_FAILURES; attempt += 1) {
      recordEmployeeLoginFailure({ username: `user-${attempt}`, ip: '203.0.113.8', now });
    }
    expect(employeeLoginIsThrottled({ username: 'fresh-name', ip: '203.0.113.8', now })).toBe(true);
    expect(employeeLoginIsThrottled({ username: 'fresh-name', ip: '203.0.113.9', now })).toBe(false);
  });
});

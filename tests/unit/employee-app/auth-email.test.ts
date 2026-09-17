import { describe, expect, it } from 'vitest';
import {
  formatOrgMemberLabel,
  isEmployeeAppInternalEmail,
} from '@/modules/employee-app/domain/auth-email';

describe('employee app auth email masking', () => {
  it('detects internal auth emails', () => {
    expect(isEmployeeAppInternalEmail('org.user@employees.pf.internal')).toBe(true);
    expect(isEmployeeAppInternalEmail('owner@company.com')).toBe(false);
  });

  it('hides internal email in member labels', () => {
    expect(
      formatOrgMemberLabel({
        displayName: 'Employee App Test',
        email: '8ef9.2485@employees.pf.internal',
      }),
    ).toBe('Employee App Test');

    expect(
      formatOrgMemberLabel({
        displayName: null,
        email: '8ef9.2485@employees.pf.internal',
      }),
    ).toBe('משתמש אפליקציית עובדים');
  });
});

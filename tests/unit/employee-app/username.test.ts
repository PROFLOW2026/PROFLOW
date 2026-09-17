import { describe, expect, it } from 'vitest';
import {
  buildEmployeeAuthEmail,
  generateDefaultUsername,
  normalizeUsername,
  validateUsername,
} from '@/modules/employee-app/domain/username';

describe('employee app username', () => {
  it('normalizes case-insensitively', () => {
    expect(normalizeUsername(' ERAN123 ')).toBe('eran123');
  });

  it('validates username pattern', () => {
    expect(validateUsername('ERAN123').valid).toBe(true);
    expect(validateUsername('ab').valid).toBe(false);
  });

  it('builds synthetic auth email scoped to organization', () => {
    const orgId = '11111111-1111-1111-1111-111111111111';
    expect(buildEmployeeAuthEmail(orgId, 'eran123')).toBe(
      `${orgId}.eran123@employees.pf.internal`,
    );
  });

  it('generates owner-visible username from employee', () => {
    const username = generateDefaultUsername('Yossi Cohen', '42');
    expect(username.length).toBeGreaterThanOrEqual(3);
  });
});

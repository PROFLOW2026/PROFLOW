import { describe, expect, it } from 'vitest';
import {
  buildEmployeeAuthEmail,
  buildUsernameCandidates,
  employeeUsernameFromAuthEmail,
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

  it('shows the employee username instead of the synthetic auth email', () => {
    const orgId = '8ef96b2a-1111-4111-8111-111111111111';
    const email = buildEmployeeAuthEmail(orgId, 'pm1');
    expect(employeeUsernameFromAuthEmail(email)).toBe('pm1');
    expect(employeeUsernameFromAuthEmail(`${orgId}.user.name@employees.pf.internal`)).toBe('user.name');
    expect(employeeUsernameFromAuthEmail('owner@company.com')).toBeNull();
  });

  it('generates owner-visible username from employee', () => {
    const username = generateDefaultUsername('Yossi Cohen', '42');
    expect(username.length).toBeGreaterThanOrEqual(3);
  });

  it('builds employee number first with suffix fallbacks', () => {
    const candidates = buildUsernameCandidates('2485', 'Yossi Cohen');
    expect(candidates[0]).toBe('2485');
    expect(candidates).toContain('2485A');
    expect(candidates).toContain('2485B');
  });

  it('pads short employee numbers to valid length', () => {
    const candidates = buildUsernameCandidates('2', 'Yossi Cohen');
    expect(candidates[0]).toBe('002');
    expect(candidates).toContain('002A');
  });
});

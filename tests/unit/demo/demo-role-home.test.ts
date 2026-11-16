import { describe, expect, it } from 'vitest';
import {
  DEMO_ROLE_CHOICES,
  demoRoleHome,
  type DemoRoleKey,
} from '@/modules/demo/domain/demo-roles';
import { DEMO_ROLE_KEYS } from '@/modules/demo/domain/demo-org';

describe('demo role home routing', () => {
  it('lists every database role key in canonical order with human labels', () => {
    expect(DEMO_ROLE_CHOICES.map((choice) => choice.key)).toEqual([
      'owner',
      'manager',
      'finance',
      'employee',
      'worker',
      'contractor',
    ]);
    expect(new Set(DEMO_ROLE_CHOICES.map((choice) => choice.key))).toEqual(new Set(DEMO_ROLE_KEYS));
    expect(DEMO_ROLE_CHOICES.find((choice) => choice.key === 'employee')?.label).toBe('עובד משרד');
    expect(DEMO_ROLE_CHOICES.find((choice) => choice.key === 'contractor')?.label).toBe('קבלן משנה');
  });

  it('routes owner to main app and contractor to contractor portal', () => {
    expect(demoRoleHome('owner')).toBe('/');
    expect(demoRoleHome('contractor')).toBe('/contractor');
  });

  it('routes manager, finance, office, and field roles to the employee app', () => {
    const employeeAppRoles: DemoRoleKey[] = ['manager', 'finance', 'employee', 'worker'];
    for (const role of employeeAppRoles) {
      expect(demoRoleHome(role)).toBe('/employee');
    }
  });
});
export const DEMO_KINDS = ['template', 'session'] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];

export const DEMO_ROLE_KEYS = ['owner', 'manager', 'finance', 'worker', 'employee', 'contractor'] as const;
export type DemoRoleKey = (typeof DEMO_ROLE_KEYS)[number];

export function isDemoRoleKey(value: unknown): value is DemoRoleKey {
  return typeof value === 'string' && (DEMO_ROLE_KEYS as readonly string[]).includes(value);
}

/** True for a template or a visitor session. A real organization has a null marker. */
export function isDemoOrganization(demoKind: string | null | undefined): boolean {
  return demoKind === 'template' || demoKind === 'session';
}

/** @deprecated Use session-cleanup helpers for hard delete and sweeper predicates. */
export function isDeletableDemoSession(demoKind: string | null | undefined, hasSessionRow: boolean): boolean {
  return demoKind === 'session' && hasSessionRow;
}

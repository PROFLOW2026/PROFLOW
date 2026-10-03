/**
 * Fixed ports and identities for the end-to-end harness.
 *
 * The harness exists so the authenticated product can be driven for real
 * without a cloud project: PGlite is served over the Postgres wire protocol so
 * `DATABASE_URL` points at a genuine Postgres (RLS policies and all), and a
 * local stand-in answers the handful of auth endpoints the app calls. No
 * application code is aware of any of this - it sees an ordinary database and
 * an ordinary auth host.
 */

export const DATABASE_PORT = 55432;
export const AUTH_PORT = 55321;
export const APP_PORT = 3100;

export const DATABASE_URL = `postgres://postgres@127.0.0.1:${DATABASE_PORT}/postgres`;
export const AUTH_URL = `http://127.0.0.1:${AUTH_PORT}`;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

/** Anything non-empty: the stand-in does not check the anon key. */
export const ANON_KEY = 'e2e-anon-key';

export const SEED_PASSWORD = 'projectflow-e2e-pass';

/** Fixed 64-char hex material so employee PIN pepper matches harness app + seed. */
export const E2E_STORAGE_TOKEN_ENCRYPTION_KEY = 'e2e'.padEnd(64, '0');

export const E2E_SUPABASE_SERVICE_ROLE_KEY = 'e2e-supabase-service-role-key';

/** Dedicated pepper so harness seed + Next agree even when `.env.local` differs. */
export const E2E_EMPLOYEE_AUTH_PASSWORD_PEPPER = 'projectflow-e2e-employee-auth-pepper-v1';

/** Owner in Org B with employee account in Org A (primary tenant). */
export const DUAL_ORG_USER = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  email: 'dual@e2e.test',
  displayName: 'משתמש דו-ארגוני',
} as const;

/** Employee-only user in primary org (single-org smoke). */
export const SINGLE_EMPLOYEE_USER = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  email: 'single-emp@e2e.test',
  displayName: 'עובד יחיד',
} as const;

export const E2E_DUAL_EMPLOYEE = {
  username: 'dual2485',
  pin: '248516',
} as const;

export const E2E_SINGLE_EMPLOYEE = {
  username: 'single99',
  pin: '990011',
} as const;

export const E2E_DUAL_ORG_A_PROJECT = 'פרויקט אימות עובד A';
export const E2E_DUAL_ORG_B_SECRET_PROJECT = 'סוד org B e2e';

export const OWNER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@e2e.test',
  displayName: 'דנה כהן',
} as const;

/** A second tenant, used to prove isolation from the browser rather than only in unit tests. */
export const OTHER_OWNER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'other@e2e.test',
  displayName: 'יוסי לוי',
} as const;

/** A worker in the first tenant: restricted permissions, used for the gating checks. */
export const WORKER = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'worker@e2e.test',
  displayName: 'אבי מזרחי',
} as const;

export const MANAGER = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'manager@e2e.test',
  displayName: 'מיכל לוי',
} as const;

export const FINANCE = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'finance@e2e.test',
  displayName: 'רון כספי',
} as const;

export const GC_OWNER = {
  id: '66666666-6666-4666-8666-666666666666',
  email: 'gc@e2e.test',
  displayName: 'קבלן ראשי',
} as const;

/** Operational project member on the GC smoke project. Employee login, no financial grants. */
export const GC_OPS_EMPLOYEE = {
  id: '12121212-1212-4212-8212-121212121212',
  email: 'ops@e2e.test',
  displayName: 'מנהל תפעול',
} as const;

export const E2E_GC_OPS_EMPLOYEE = {
  username: 'opspm',
  pin: '135790',
} as const;

/** Contractor portal account on the GC smoke agreement. */
export const E2E_GC_CONTRACTOR = {
  username: 'kablan1',
  displayName: 'קבלן משנה בדיקה',
} as const;

export const ELECTRICAL_OWNER = {
  id: '77777777-7777-4777-8777-777777777777',
  email: 'electrical@e2e.test',
  displayName: 'חשמלאי',
} as const;

export const PLUMBING_OWNER = {
  id: '88888888-8888-4888-8888-888888888888',
  email: 'plumbing@e2e.test',
  displayName: 'אינסטלטור',
} as const;

export const MAINTENANCE_OWNER = {
  id: '99999999-9999-4999-8999-999999999999',
  email: 'maintenance@e2e.test',
  displayName: 'תחזוקה',
} as const;

export const FIELD_OWNER = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'field@e2e.test',
  displayName: 'שירות שטח',
} as const;

export const MIXED_OWNER = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'mixed@e2e.test',
  displayName: 'מעורב',
} as const;

export const SEED_USERS = [
  OWNER,
  OTHER_OWNER,
  DUAL_ORG_USER,
  SINGLE_EMPLOYEE_USER,
  WORKER,
  MANAGER,
  FINANCE,
  GC_OWNER,
  GC_OPS_EMPLOYEE,
  ELECTRICAL_OWNER,
  PLUMBING_OWNER,
  MAINTENANCE_OWNER,
  FIELD_OWNER,
  MIXED_OWNER,
];

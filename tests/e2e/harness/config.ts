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
  WORKER,
  MANAGER,
  FINANCE,
  GC_OWNER,
  ELECTRICAL_OWNER,
  PLUMBING_OWNER,
  MAINTENANCE_OWNER,
  FIELD_OWNER,
  MIXED_OWNER,
];

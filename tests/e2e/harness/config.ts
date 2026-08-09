/**
 * Fixed ports and identities for the end-to-end harness.
 *
 * The harness exists so the authenticated product can be driven for real
 * without a cloud project: PGlite is served over the Postgres wire protocol so
 * `DATABASE_URL` points at a genuine Postgres (RLS policies and all), and a
 * local stand-in answers the handful of auth endpoints the app calls. No
 * application code is aware of any of this — it sees an ordinary database and
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

export const SEED_USERS = [OWNER, OTHER_OWNER, WORKER];

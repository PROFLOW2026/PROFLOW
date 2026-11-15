import { isDemoRoleKey, type DemoRoleKey } from './demo-org';

const USER_IDENTIFIER_KEYS = new Set([
  'userId',
  'user_id',
  'authUserId',
  'auth_user_id',
  'email',
  'token_hash',
  'tokenHash',
  'hashed_token',
  'action_link',
]);

export type RoleSwitchParse = { readonly ok: true; readonly roleKey: DemoRoleKey } | { readonly ok: false };

/** The request body may contain only roleKey. Any user identifier rejects the whole request. */
export function parseDemoRoleSwitch(body: unknown): RoleSwitchParse {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false };
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'roleKey') return { ok: false };
  if ([...keys].some((key) => USER_IDENTIFIER_KEYS.has(key))) return { ok: false };
  if (!isDemoRoleKey(record.roleKey)) return { ok: false };
  return { ok: true, roleKey: record.roleKey };
}

import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getAdminDb } from '@/shared/db/client';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { employeeSupabaseAuthPassword } from '../domain/auth-password';
import { isValidPin, LOGIN_LOCK_MS, MAX_LOGIN_ATTEMPTS } from '../domain/pin';
import { normalizeUsername } from '../domain/username';
import {
  findEmployeeAppAccountByUsernameGlobal,
  updateEmployeeAppAccount,
} from '../data/accounts.repository';
import { insertEmployeeAppAuditEvent } from '../data/audit.repository';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/shared/supabase/admin';

export interface EmployeeLoginInput {
  username: string;
  pin: string;
}

export interface EmployeeLoginResult {
  readonly pinMustChange: boolean;
  readonly accountId: string;
  readonly employeeId: string;
}

type EmployeeLoginFailureReason =
  | 'invalid_pin_format'
  | 'username_not_found'
  | 'account_blocked'
  | 'account_locked'
  | 'access_not_started'
  | 'access_expired'
  | 'temp_pin_expired'
  | 'supabase_invalid_credentials'
  | 'supabase_auth_error'
  | 'auth_not_configured'
  | 'unexpected_error';

async function recordLoginFailure(
  db: Awaited<ReturnType<typeof getAdminDb>>,
  account: { organizationId: string; employeeId: string; id: string; failedLoginCount: number } | null,
  reason: EmployeeLoginFailureReason,
  detail: Record<string, unknown> = {},
): Promise<void> {
  if (!account) return;
  const failed = account.failedLoginCount + 1;
  const lockedUntil =
    failed >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOGIN_LOCK_MS) : null;
  await updateEmployeeAppAccount(db, account.organizationId, account.id, {
    failedLoginCount: failed,
    lockedUntil,
  });
  await insertEmployeeAppAuditEvent(db, {
    organizationId: account.organizationId,
    employeeId: account.employeeId,
    actorUserId: null,
    action: 'login_failed',
    detailJson: { reason, failedCount: failed, ...detail },
  });
}

async function signInWithEmployeeCredentials(authEmail: string, pin: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new DomainRuleError('Auth is not configured', 'employeeApp.errors.notConfigured');
  }

  try {
    const supabase = await createSupabaseServerClient();
    return supabase.auth.signInWithPassword({
      email: authEmail,
      password: employeeSupabaseAuthPassword(pin),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('outside a request scope') && !message.includes('`cookies`')) {
      throw error;
    }
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return client.auth.signInWithPassword({
      email: authEmail,
      password: employeeSupabaseAuthPassword(pin),
    });
  }
}

export async function employeeLogin(input: EmployeeLoginInput): Promise<EmployeeLoginResult> {
  if (!isSupabaseConfigured()) {
    throw new DomainRuleError('Auth is not configured', 'employeeApp.errors.notConfigured');
  }

  const usernameNormalized = normalizeUsername(input.username);
  const db = getAdminDb();

  if (!isValidPin(input.pin)) {
    throw new DomainRuleError('Invalid credentials', 'employeeApp.errors.invalidCredentials');
  }

  const account = await findEmployeeAppAccountByUsernameGlobal(db, usernameNormalized);
  if (!account) {
    throw new DomainRuleError('Invalid credentials', 'employeeApp.errors.invalidCredentials');
  }

  if (account.status === 'blocked' || account.status === 'suspended' || account.status === 'inactive') {
    await recordLoginFailure(db, account, 'account_blocked', { status: account.status });
    throw new DomainRuleError('Account is not active', 'employeeApp.errors.accountBlocked');
  }

  const now = new Date();
  if (account.lockedUntil && account.lockedUntil > now) {
    throw new DomainRuleError('Account is temporarily locked', 'employeeApp.errors.accountLocked');
  }

  if (account.accessStartsAt && account.accessStartsAt > now) {
    await recordLoginFailure(db, account, 'access_not_started');
    throw new DomainRuleError('Access not yet available', 'employeeApp.errors.accessNotStarted');
  }
  if (account.accessEndsAt && account.accessEndsAt < now) {
    await recordLoginFailure(db, account, 'access_expired');
    throw new DomainRuleError('Access has expired', 'employeeApp.errors.accessExpired');
  }

  if (
    account.pinMustChange &&
    account.temporaryPinExpiresAt &&
    account.temporaryPinExpiresAt < now
  ) {
    await recordLoginFailure(db, account, 'temp_pin_expired');
    throw new DomainRuleError('Temporary PIN has expired', 'employeeApp.errors.tempPinExpired');
  }

  let signInResult: Awaited<ReturnType<typeof signInWithEmployeeCredentials>>;
  try {
    signInResult = await signInWithEmployeeCredentials(account.authEmail, input.pin);
  } catch (error) {
    await recordLoginFailure(db, account, 'unexpected_error', {
      phase: 'sign_in',
      message: error instanceof Error ? error.message : String(error),
    });
    throw new DomainRuleError('Auth is not configured', 'employeeApp.errors.notConfigured');
  }

  const { error } = signInResult;
  if (error) {
    const reason: EmployeeLoginFailureReason =
      error.message === 'Invalid login credentials' || error.code === 'invalid_credentials'
        ? 'supabase_invalid_credentials'
        : 'supabase_auth_error';
    await recordLoginFailure(db, account, reason, {
      supabaseCode: error.code ?? null,
      supabaseMessage: error.message,
    });
    throw new DomainRuleError('Invalid credentials', 'employeeApp.errors.invalidCredentials');
  }

  await updateEmployeeAppAccount(db, account.organizationId, account.id, {
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: now,
    status: account.status === 'invited' ? 'active' : account.status,
  });

  await insertEmployeeAppAuditEvent(db, {
    organizationId: account.organizationId,
    employeeId: account.employeeId,
    actorUserId: account.userId,
    action: 'login_success',
  });

  return {
    pinMustChange: account.pinMustChange,
    accountId: account.id,
    employeeId: account.employeeId,
  };
}

export async function employeeSetPermanentPin(input: {
  organizationId: string;
  userId: string;
  newPin: string;
  confirmPin: string;
}): Promise<void> {
  if (!isValidPin(input.newPin) || input.newPin !== input.confirmPin) {
    throw new DomainRuleError('PIN must be 6 digits and match', 'employeeApp.errors.pinInvalid');
  }

  const db = getAdminDb();
  const { findEmployeeAppAccountByUserId } = await import('../data/accounts.repository');
  const account = await findEmployeeAppAccountByUserId(db, input.organizationId, input.userId);
  if (!account) throw new NotFoundError('Employee app account');

  if (!isSupabaseAdminConfigured()) {
    throw new DomainRuleError('Auth admin is not configured', 'employeeApp.errors.notConfigured');
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(account.userId, {
    password: employeeSupabaseAuthPassword(input.newPin),
  });
  if (error) {
    throw new DomainRuleError(error.message, 'employeeApp.errors.pinUpdateFailed');
  }

  await updateEmployeeAppAccount(db, account.organizationId, account.id, {
    pinMustChange: false,
    temporaryPinExpiresAt: null,
    temporaryPinSealed: null,
    firstLoginAt: account.firstLoginAt ?? new Date(),
    status: 'active',
  });

  await insertEmployeeAppAuditEvent(db, {
    organizationId: account.organizationId,
    employeeId: account.employeeId,
    actorUserId: account.userId,
    action: 'first_login_completed',
  });
}

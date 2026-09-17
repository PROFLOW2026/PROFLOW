import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import {
  findEmployeeAppAccountByUsernameGlobal,
  isUsernameGloballyAvailable,
} from '../data/accounts.repository';
import { buildUsernameCandidates, validateUsername } from '../domain/username';

export async function allocateGloballyUniqueUsername(
  db: DbExecutor,
  input: {
    employeeName: string;
    employeeNumber: string | null;
    requestedUsername?: string;
    exceptAccountId?: string;
  },
): Promise<{ username: string; normalized: string }> {
  if (input.requestedUsername) {
    const check = validateUsername(input.requestedUsername);
    if (!check.valid) {
      throw new ValidationError([{ path: 'username', message: 'Invalid username' }]);
    }
    const available = await isUsernameGloballyAvailable(
      db,
      check.normalized,
      input.exceptAccountId,
    );
    if (!available) {
      throw new DomainRuleError('Username is taken', 'employeeApp.errors.usernameTaken');
    }
    return { username: input.requestedUsername.toUpperCase(), normalized: check.normalized };
  }

  for (const candidate of buildUsernameCandidates(input.employeeNumber, input.employeeName)) {
    const check = validateUsername(candidate);
    if (!check.valid) continue;
    const available = await isUsernameGloballyAvailable(
      db,
      check.normalized,
      input.exceptAccountId,
    );
    if (available) {
      return { username: candidate.toUpperCase(), normalized: check.normalized };
    }
  }

  throw new DomainRuleError(
    'Could not allocate username',
    'employeeApp.errors.usernameUnavailable',
  );
}

export async function assertUsernameGloballyUnique(
  db: DbExecutor,
  usernameNormalized: string,
  exceptAccountId?: string,
): Promise<void> {
  const existing = await findEmployeeAppAccountByUsernameGlobal(db, usernameNormalized);
  if (existing && existing.id !== exceptAccountId) {
    throw new DomainRuleError('Username is taken', 'employeeApp.errors.usernameTaken');
  }
}

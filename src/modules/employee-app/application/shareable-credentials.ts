import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { hasActiveTempPinWindow } from '../domain/access-status';
import { openTemporaryPinSealed, sealTemporaryPin } from '../domain/temporary-pin-seal';
import type { EmployeeAppAccountRecord } from '../domain/types';
import { updateEmployeeAppAccount } from '../data/accounts.repository';

export interface EmployeeShareableCredentials {
  readonly username: string;
  readonly temporaryPin: string;
  readonly temporaryPinExpiresAt: Date;
}

export async function storeTemporaryPinForOwnerShare(
  db: DbExecutor,
  organizationId: string,
  accountId: string,
  temporaryPin: string,
): Promise<void> {
  await updateEmployeeAppAccount(db, organizationId, accountId, {
    temporaryPinSealed: sealTemporaryPin(temporaryPin),
  });
}

export async function clearStoredTemporaryPin(
  db: DbExecutor,
  organizationId: string,
  accountId: string,
): Promise<void> {
  await updateEmployeeAppAccount(db, organizationId, accountId, {
    temporaryPinSealed: null,
  });
}

export async function resolveShareableCredentials(
  db: DbExecutor,
  organizationId: string,
  account: EmployeeAppAccountRecord,
  temporaryPinSealed: string | null,
): Promise<EmployeeShareableCredentials | null> {
  if (!hasActiveTempPinWindow(account)) {
    if (temporaryPinSealed) {
      await clearStoredTemporaryPin(db, organizationId, account.id);
    }
    return null;
  }

  if (!temporaryPinSealed) return null;

  try {
    const temporaryPin = openTemporaryPinSealed(temporaryPinSealed);
    return {
      username: account.username,
      temporaryPin,
      temporaryPinExpiresAt: account.temporaryPinExpiresAt!,
    };
  } catch {
    await clearStoredTemporaryPin(db, organizationId, account.id);
    return null;
  }
}

import type { EmployeeAppAccountRecord } from './types';

export interface EmployeeAccessStatusView {
  readonly statusKey: string;
  readonly hintKey?: string;
}

export function deriveEmployeeAccessStatusView(
  account: EmployeeAppAccountRecord,
  now: Date = new Date(),
): EmployeeAccessStatusView {
  if (account.accessEndsAt && account.accessEndsAt < now) {
    return { statusKey: 'accessEnded' };
  }
  if (account.status === 'inactive') {
    return { statusKey: 'notActivated' };
  }
  if (account.status === 'invited') {
    return { statusKey: 'invited', hintKey: 'awaitingFirstLogin' };
  }
  if (account.status === 'active') {
    return { statusKey: 'active' };
  }
  if (account.status === 'suspended') {
    return { statusKey: 'suspended' };
  }
  if (account.status === 'blocked') {
    return { statusKey: 'blocked' };
  }
  return { statusKey: account.status };
}

/** Owner may share temp PIN only while employee must still change PIN and expiry is in the future. */
export function hasActiveTempPinWindow(
  account: EmployeeAppAccountRecord,
  now: Date = new Date(),
): boolean {
  if (!account.pinMustChange) return false;
  if (!account.temporaryPinExpiresAt) return false;
  return account.temporaryPinExpiresAt > now;
}

export function hasPersonalPinSet(account: EmployeeAppAccountRecord): boolean {
  return Boolean(account.firstLoginAt) && !account.pinMustChange;
}

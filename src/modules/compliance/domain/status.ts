import {
  addDays,
  businessDate,
  compareBusinessDates,
  type BusinessDate,
} from '@/shared/dates/dates';
import {
  EXPIRING_SOON_DAYS,
  type ArtifactStatus,
  type ManualArtifactStatus,
} from './types';

/**
 * Derives compliance artifact status from expiry vs today (doc 24).
 *
 * Manual `pending` / `revoked` are preserved. Otherwise:
 * - no expiry → valid
 * - expires before today → expired
 * - expires within 30 days (inclusive) → expiring_soon
 * - otherwise → valid
 */
export function deriveArtifactStatus(input: {
  readonly expiresOn: string | null | undefined;
  readonly manualStatus?: ManualArtifactStatus | null;
  readonly today: BusinessDate;
}): ArtifactStatus {
  if (input.manualStatus === 'pending' || input.manualStatus === 'revoked') {
    return input.manualStatus;
  }

  if (!input.expiresOn) {
    return 'valid';
  }

  const expiresOn = businessDate(input.expiresOn);
  if (compareBusinessDates(expiresOn, input.today) < 0) {
    return 'expired';
  }

  const soonCutoff = addDays(input.today, EXPIRING_SOON_DAYS);
  if (compareBusinessDates(expiresOn, soonCutoff) <= 0) {
    return 'expiring_soon';
  }

  return 'valid';
}

/**
 * Resolves the status to show / persist: honour stored manual statuses,
 * otherwise re-derive from expiry so list badges stay accurate without jobs.
 */
export function resolveArtifactStatus(input: {
  readonly expiresOn: string | null;
  readonly storedStatus: ArtifactStatus;
  readonly today: BusinessDate;
}): ArtifactStatus {
  if (input.storedStatus === 'pending' || input.storedStatus === 'revoked') {
    return input.storedStatus;
  }

  return deriveArtifactStatus({
    expiresOn: input.expiresOn,
    today: input.today,
  });
}

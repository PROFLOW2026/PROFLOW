import { ValidationError } from '@/shared/errors';

/** Server guard: business change was confirmed in UI before persist. */
export function assertBusinessChangeAcknowledged(
  acknowledged: boolean | undefined,
  messageKey = 'errors.confirmRequired',
): void {
  if (acknowledged !== true) {
    throw new ValidationError([{ path: 'changeAcknowledged', message: messageKey }]);
  }
}

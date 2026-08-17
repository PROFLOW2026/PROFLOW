import { DomainRuleError } from '@/shared/errors';

export const WARRANTY_ERROR_DATES = 'warranty.errors.dates';

export function assertWarrantyDateOrder(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): void {
  if (startDate && endDate && endDate < startDate) {
    throw new DomainRuleError('End date cannot be before start date', WARRANTY_ERROR_DATES);
  }
}

export function deriveCoverageStatus(input: {
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly today: string;
  readonly voided?: boolean;
}): 'scheduled' | 'active' | 'expired' | 'void' {
  if (input.voided) return 'void';
  if (input.endDate && input.endDate < input.today) return 'expired';
  if (!input.startDate || input.startDate > input.today) return 'scheduled';
  return 'active';
}

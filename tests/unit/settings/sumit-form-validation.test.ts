import { describe, expect, it } from 'vitest';
import { isValidSumitCompanyIdInput } from '@/app/[locale]/(app)/settings/integrations/sumit-form-validation';

describe('SUMIT connect form validation', () => {
  it('accepts positive numeric company ids', () => {
    expect(isValidSumitCompanyIdInput('12345')).toBe(true);
    expect(isValidSumitCompanyIdInput(' 999 ')).toBe(true);
  });

  it('rejects non-numeric and non-positive values', () => {
    expect(isValidSumitCompanyIdInput('')).toBe(false);
    expect(isValidSumitCompanyIdInput('0')).toBe(false);
    expect(isValidSumitCompanyIdInput('12a34')).toBe(false);
    expect(isValidSumitCompanyIdInput('user@example.com')).toBe(false);
  });
});

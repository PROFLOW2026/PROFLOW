import { describe, expect, it } from 'vitest';
import { assertStartBeforeDue } from '@/modules/tasks/domain/start-before-due';
import { ValidationError } from '@/shared/errors';

describe('start before due validation', () => {
  it('rejects startDate after dueDate', () => {
    expect(() => assertStartBeforeDue('2026-10-10', '2026-10-05')).toThrow(ValidationError);
  });

  it('allows equal or missing dates', () => {
    expect(() => assertStartBeforeDue('2026-10-05', '2026-10-05')).not.toThrow();
    expect(() => assertStartBeforeDue(null, '2026-10-05')).not.toThrow();
  });
});

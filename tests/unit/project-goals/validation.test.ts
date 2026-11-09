import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/shared/errors';
import {
  parseCreateProjectGoal,
  parseUpdateProjectGoalStatus,
} from '@/modules/project-goals/validation/schemas';

const projectId = '11111111-1111-4111-8111-111111111111';
const goalId = '22222222-2222-4222-8222-222222222222';

describe('project goal validation', () => {
  it('accepts a well-formed create payload', () => {
    const parsed = parseCreateProjectGoal({
      projectId,
      title: '  Handover ready  ',
      dueOn: '2026-12-01',
      status: 'in_progress',
      progressPercent: 40,
    });
    expect(parsed.title).toBe('Handover ready');
    expect(parsed.dueOn).toBe('2026-12-01');
    expect(parsed.progressPercent).toBe(40);
  });

  it('rejects empty titles and out-of-range progress', () => {
    expect(() =>
      parseCreateProjectGoal({ projectId, title: '   ', progressPercent: 0 }),
    ).toThrow(ValidationError);
    expect(() =>
      parseCreateProjectGoal({ projectId, title: 'ok', progressPercent: 101 }),
    ).toThrow(ValidationError);
    expect(() =>
      parseCreateProjectGoal({ projectId, title: 'ok', progressPercent: -1 }),
    ).toThrow(ValidationError);
  });

  it('validates status updates', () => {
    const parsed = parseUpdateProjectGoalStatus({
      projectId,
      goalId,
      status: 'completed',
    });
    expect(parsed.status).toBe('completed');
    expect(() =>
      parseUpdateProjectGoalStatus({ projectId, goalId, status: 'bogus' }),
    ).toThrow(ValidationError);
  });
});

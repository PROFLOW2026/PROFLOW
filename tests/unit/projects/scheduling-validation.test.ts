import { describe, expect, it } from 'vitest';
import { updateProjectSchema, createMilestoneSchema } from '@/modules/projects/validation/schemas';

const PROJECT_ID = '018f1234-5678-7abc-8def-0123456789ab';

describe('light scheduling validation', () => {
  it('accepts optional progress fields', () => {
    const parsed = updateProjectSchema.safeParse({
      projectId: PROJECT_ID,
      progressPercent: '42.5',
      progressStatus: 'on_track',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown progress status', () => {
    const parsed = updateProjectSchema.safeParse({
      projectId: PROJECT_ID,
      progressStatus: 'flying',
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts milestone create payload', () => {
    const parsed = createMilestoneSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'Foundation complete',
      targetDate: '2026-09-01',
    });
    expect(parsed.success).toBe(true);
  });
});

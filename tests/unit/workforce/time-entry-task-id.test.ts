import { describe, expect, it } from 'vitest';
import { createTimeEntrySchema, createBulkTimeEntriesSchema } from '@/modules/workforce/validation/schemas';

const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const TASK_A = '33333333-3333-4333-8333-333333333333';
const EMPLOYEE = '44444444-4444-4444-8444-444444444444';
const TIME_CODE = '55555555-5555-4555-8555-555555555555';

describe('createTimeEntrySchema task_id validation', () => {
  it('accepts optional taskId when kind is project and projectId is set', () => {
    const parsed = createTimeEntrySchema.safeParse({
      employeeId: EMPLOYEE,
      workDate: '2026-09-21',
      hours: '8',
      kind: 'project',
      projectId: PROJECT_A,
      taskId: TASK_A,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects taskId for non-project time', () => {
    const parsed = createTimeEntrySchema.safeParse({
      employeeId: EMPLOYEE,
      workDate: '2026-09-21',
      hours: '8',
      kind: 'non_project',
      timeCodeId: TIME_CODE,
      taskId: TASK_A,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes('taskId'))).toBe(true);
    }
  });

  it('rejects taskId without projectId', () => {
    const parsed = createTimeEntrySchema.safeParse({
      employeeId: EMPLOYEE,
      workDate: '2026-09-21',
      hours: '8',
      kind: 'project',
      taskId: TASK_A,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes('taskId'))).toBe(true);
    }
  });
});

describe('createBulkTimeEntriesSchema task_id validation', () => {
  it('accepts taskId on bulk project entries', () => {
    const parsed = createBulkTimeEntriesSchema.safeParse({
      employeeId: EMPLOYEE,
      fromDate: '2026-09-21',
      toDate: '2026-09-21',
      hours: '8',
      kind: 'project',
      projectId: PROJECT_A,
      taskId: TASK_A,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects taskId without projectId on bulk entries', () => {
    const parsed = createBulkTimeEntriesSchema.safeParse({
      employeeId: EMPLOYEE,
      fromDate: '2026-09-21',
      toDate: '2026-09-21',
      hours: '8',
      kind: 'project',
      taskId: TASK_A,
    });
    expect(parsed.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildScheduleSummary,
  DATE_ORDER_MESSAGE,
  isEndBeforeStart,
  isMilestoneOverdue,
  isProjectTargetOverdue,
  isWorkPackageOverdue,
  resolveProjectProgressPercent,
  rollupWorkPackageProgress,
} from '@/modules/projects/domain/scheduling';
import {
  createMilestoneSchema,
  createProjectSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  updateWorkPackageSchema,
} from '@/modules/projects/validation/schemas';

const PROJECT_ID = '018f1234-5678-7abc-8def-0123456789ab';
const MILESTONE_ID = '018f1234-5678-7abc-8def-0123456789cd';

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

  it('rejects end date before start date on project', () => {
    const parsed = createProjectSchema.safeParse({
      name: 'Bad dates',
      startDate: '2026-09-10',
      targetEndDate: '2026-09-01',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message === DATE_ORDER_MESSAGE)).toBe(true);
    }
  });

  it('rejects work package end before start', () => {
    const parsed = updateWorkPackageSchema.safeParse({
      workPackageId: '018f1234-5678-7abc-8def-0123456789ef',
      startDate: '2026-10-01',
      endDate: '2026-09-01',
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

  it('accepts milestone status update to achieved', () => {
    const parsed = updateMilestoneSchema.safeParse({
      milestoneId: MILESTONE_ID,
      status: 'achieved',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts work package progress update', () => {
    const parsed = updateWorkPackageSchema.safeParse({
      workPackageId: '018f1234-5678-7abc-8def-0123456789ef',
      progressPercent: '75',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('schedule domain helpers', () => {
  it('detects end-before-start', () => {
    expect(isEndBeforeStart('2026-01-10', '2026-01-01')).toBe(true);
    expect(isEndBeforeStart('2026-01-01', '2026-01-10')).toBe(false);
    expect(isEndBeforeStart(null, '2026-01-10')).toBe(false);
  });

  it('marks planned milestones past target as overdue', () => {
    expect(
      isMilestoneOverdue(
        { status: 'planned', targetDate: '2026-08-01', archivedAt: null },
        '2026-08-09',
      ),
    ).toBe(true);
    expect(
      isMilestoneOverdue(
        { status: 'achieved', targetDate: '2026-08-01', archivedAt: null },
        '2026-08-09',
      ),
    ).toBe(false);
  });

  it('marks active projects past target end as overdue', () => {
    expect(
      isProjectTargetOverdue(
        {
          status: 'active',
          targetEndDate: '2026-08-01',
          actualEndDate: null,
        },
        '2026-08-09',
      ),
    ).toBe(true);
    expect(
      isProjectTargetOverdue(
        {
          status: 'completed',
          targetEndDate: '2026-08-01',
          actualEndDate: null,
        },
        '2026-08-09',
      ),
    ).toBe(false);
  });

  it('rolls up work-package progress and prefers project percent', () => {
    expect(
      rollupWorkPackageProgress([
        { progressPercent: '50', archivedAt: null },
        { progressPercent: '100', archivedAt: null },
      ]),
    ).toBe(75);
    expect(
      resolveProjectProgressPercent({ progressPercent: '40' }, [
        { progressPercent: '80', archivedAt: null },
      ]),
    ).toBe(40);
  });

  it('builds a schedule summary with next overdue milestone', () => {
    const summary = buildScheduleSummary({
      project: {
        status: 'active',
        startDate: '2026-07-01',
        targetEndDate: '2026-08-01',
        actualEndDate: null,
        progressPercent: null,
        progressStatus: 'delayed',
      },
      workPackages: [
        { endDate: '2026-08-01', progressPercent: '50', archivedAt: null },
        { endDate: '2026-07-01', progressPercent: '20', archivedAt: null },
      ],
      milestones: [
        {
          id: '1',
          name: 'Late',
          targetDate: '2026-08-01',
          status: 'planned',
          archivedAt: null,
          sortOrder: 0,
        },
        {
          id: '2',
          name: 'Done',
          targetDate: '2026-07-01',
          status: 'achieved',
          archivedAt: null,
          sortOrder: 1,
        },
      ],
      today: '2026-08-09',
    });

    expect(summary.projectOverdue).toBe(true);
    expect(summary.overdueMilestoneCount).toBe(1);
    expect(summary.overdueWorkPackageCount).toBe(2);
    expect(summary.overduePhaseCount).toBe(0);
    expect(summary.progressPercent).toBe(35);
    expect(summary.nextMilestone?.name).toBe('Late');
    expect(summary.nextMilestone?.overdue).toBe(true);
    expect(isWorkPackageOverdue({ endDate: '2026-08-01', progressPercent: '100', archivedAt: null }, '2026-08-09')).toBe(
      false,
    );
  });
});

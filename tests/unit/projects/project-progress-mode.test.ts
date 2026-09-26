import { describe, expect, it } from 'vitest';
import {
  displayedProjectProgress,
  schedulePercentForReader,
} from '@/modules/projects/application/project-progress-mode';

describe('displayedProjectProgress', () => {
  it('keeps the stored manual percent and ignores contributing tasks', () => {
    const result = displayedProjectProgress({
      progressSource: 'manual',
      storedPercent: '40',
      tasks: [{ status: 'done', contributesToProgress: true, progressWeight: 1 }],
    });
    expect(result.source).toBe('manual');
    expect(result.storedPercent).toBe('40');
    expect(result.displayedPercent).toBe(40);
  });

  it('derives the shown percent in tasks mode without replacing the stored percent', () => {
    const result = displayedProjectProgress({
      progressSource: 'tasks',
      storedPercent: '40',
      tasks: [
        { status: 'done', contributesToProgress: true, progressWeight: null },
        { status: 'todo', contributesToProgress: true, progressWeight: 1 },
        { status: 'cancelled', contributesToProgress: true, progressWeight: 9 },
        { status: 'done', contributesToProgress: true, progressWeight: 1, isArchived: true },
      ],
    });
    expect(result.displayedPercent).toBe(50);
    expect(result.storedPercent).toBe('40');
    expect(result.contributingCount).toBe(2);
    expect(result.doneCount).toBe(1);
  });

  it('shows null when tasks mode has nothing left to count', () => {
    const result = displayedProjectProgress({
      progressSource: 'tasks',
      storedPercent: '15',
      tasks: [],
    });
    expect(result.displayedPercent).toBeNull();
    expect(result.storedPercent).toBe('15');
  });
});

describe('schedulePercentForReader', () => {
  it('keeps the schedule percent in manual mode', () => {
    expect(schedulePercentForReader('manual', 25, 80)).toBe(25);
  });

  it('uses the derived percent in tasks mode', () => {
    expect(schedulePercentForReader('tasks', 25, null)).toBeNull();
    expect(schedulePercentForReader('tasks', 25, 60.8)).toBe(60.8);
  });
});

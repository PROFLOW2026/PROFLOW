import { describe, expect, it } from 'vitest';
import {
  formatActivityDiff,
  formatActivityPayloadSummary,
  localizeActivityScalar,
  resolveActivityEventLabelKey,
} from '@/modules/tasks/ui/format-task-activity-display';

const t = (key: string, values?: Record<string, string | number | Date>) => {
  const map: Record<string, string> = {
    'status.todo': 'To do',
    'status.in_progress': 'In progress',
    'priority.high': 'High',
    'priority.medium': 'Medium',
    'activity.fields.title': 'Title',
    'activity.fields.description': 'Description',
    'activity.checklistAdded': `Added "${values?.title ?? ''}"`,
    'activity.assigneeRemoved': 'Removed assignee',
    'activity.employeePostponedFromTo': `from ${values?.from ?? ''} to ${values?.to ?? ''}`,
    'activity.employeePostponedReason': `Reason: ${values?.reason ?? ''}`,
  };
  return map[key] ?? key;
};

describe('resolveActivityEventLabelKey', () => {
  it('uses flat activity namespace keys', () => {
    expect(resolveActivityEventLabelKey('status_changed')).toBe('activity.status_changed');
  });
});

describe('localizeActivityScalar', () => {
  it('localizes status enums', () => {
    expect(localizeActivityScalar('status', 'todo', t, 'en')).toBe('To do');
    expect(localizeActivityScalar('status', 'in_progress', t, 'en')).toBe('In progress');
  });

  it('localizes priority enums', () => {
    expect(localizeActivityScalar('priority', 'high', t, 'en')).toBe('High');
  });
});

describe('formatActivityDiff', () => {
  it('returns localized before/after values for status changes', () => {
    expect(
      formatActivityDiff(
        'status_changed',
        { from: 'todo', to: 'in_progress' },
        t,
        'en',
      ),
    ).toEqual({ from: 'To do', to: 'In progress' });
  });

  it('returns localized field label for automation title changes', () => {
    expect(
      formatActivityPayloadSummary(
        'automation_changed',
        { field: 'title', from: 'Old', to: 'New' },
        t,
      ),
    ).toBe('Title');
  });
});

describe('resolveActivityEventLabelKey with postponement payload', () => {
  it('uses employee postponement label', () => {
    expect(
      resolveActivityEventLabelKey('due_date_changed', { postponementOption: 'day' }),
    ).toBe('activity.employeePostponed');
  });
});

describe('formatActivityPayloadSummary', () => {
  it('describes employee postponement with optional reason', () => {
    expect(
      formatActivityPayloadSummary(
        'due_date_changed',
        {
          from: '2026-09-12',
          to: '2026-09-19',
          postponementOption: 'week',
          reason: 'Waiting for supplier',
        },
        t,
        'en',
      ),
    ).toContain('Waiting for supplier');
  });

  it('describes checklist additions', () => {
    expect(
      formatActivityPayloadSummary(
        'checklist_completed',
        { action: 'added', title: 'Main cut' },
        t,
      ),
    ).toBe('Added "Main cut"');
  });

  it('describes assignee removal', () => {
    expect(
      formatActivityPayloadSummary('assigned', { action: 'removed' }, t),
    ).toBe('Removed assignee');
  });
});

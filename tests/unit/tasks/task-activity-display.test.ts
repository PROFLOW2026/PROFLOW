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
    expect(localizeActivityScalar('status', 'todo', t)).toBe('To do');
    expect(localizeActivityScalar('status', 'in_progress', t)).toBe('In progress');
  });

  it('localizes priority enums', () => {
    expect(localizeActivityScalar('priority', 'high', t)).toBe('High');
  });
});

describe('formatActivityDiff', () => {
  it('returns localized before/after values for status changes', () => {
    expect(
      formatActivityDiff(
        'status_changed',
        { from: 'todo', to: 'in_progress' },
        t,
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

describe('formatActivityPayloadSummary', () => {
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

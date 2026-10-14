// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEditableTarget } from '@/modules/tasks/ui/use-task-shortcuts';

describe('useTaskShortcuts', () => {
  it('does not treat focused inputs as shortcut targets', () => {
    const input = document.createElement('input');
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
  });
});

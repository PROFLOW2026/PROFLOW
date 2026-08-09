import { describe, expect, it } from 'vitest';
import { isFocusedComposerPath } from '@/components/shell/navigation';

describe('isFocusedComposerPath', () => {
  it('treats create and edit segments as focused composer flows', () => {
    expect(isFocusedComposerPath('/projects/new')).toBe(true);
    expect(isFocusedComposerPath('/expenses/new')).toBe(true);
    expect(isFocusedComposerPath('/billing/payments/new')).toBe(true);
    expect(isFocusedComposerPath('/clients/abc/edit')).toBe(true);
    expect(isFocusedComposerPath('/he-IL/projects/new')).toBe(true);
  });

  it('leaves list and detail routes on the FAB', () => {
    expect(isFocusedComposerPath('/')).toBe(false);
    expect(isFocusedComposerPath('/projects')).toBe(false);
    expect(isFocusedComposerPath('/projects/abc')).toBe(false);
    expect(isFocusedComposerPath('/expenses/abc')).toBe(false);
    expect(isFocusedComposerPath('/reports')).toBe(false);
  });
});

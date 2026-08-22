import { describe, expect, it } from 'vitest';
import { isFocusedComposerPath, shouldHideQuickCreateForRoute } from '@/components/shell/navigation';

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

describe('shouldHideQuickCreateForRoute', () => {
  it('hides quick-create on project/job time tabs with dedicated log-time CTA', () => {
    const params = new URLSearchParams('tab=time');
    expect(shouldHideQuickCreateForRoute('/projects/abc', params)).toBe(true);
    expect(shouldHideQuickCreateForRoute('/jobs/job-1', params)).toBe(true);
    expect(shouldHideQuickCreateForRoute('/he-IL/projects/abc', params)).toBe(true);
  });

  it('keeps quick-create on other project tabs and routes', () => {
    expect(shouldHideQuickCreateForRoute('/projects/abc', new URLSearchParams('tab=team'))).toBe(
      false,
    );
    expect(shouldHideQuickCreateForRoute('/projects/abc', null)).toBe(false);
    expect(shouldHideQuickCreateForRoute('/workforce/time', new URLSearchParams('tab=time'))).toBe(
      false,
    );
  });
});

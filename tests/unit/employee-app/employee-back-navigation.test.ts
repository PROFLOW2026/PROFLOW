import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveEmployeeShellHeader,
  shouldUseEmployeeHistoryBack,
} from '@/modules/employee-app/domain/employee-back-navigation';

describe('employee-back-navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('hides header on employee home', () => {
    expect(resolveEmployeeShellHeader('/employee')).toEqual({
      showHeader: false,
      showBack: false,
      fallbackHref: '/employee',
      titleKey: null,
    });
  });

  it('shows back to home from top-level section pages', () => {
    expect(resolveEmployeeShellHeader('/employee/time')).toEqual({
      showHeader: true,
      showBack: true,
      fallbackHref: '/employee',
      titleKey: 'nav.timeAndAttendance',
    });
  });

  it('falls back to section parent for nested routes', () => {
    expect(resolveEmployeeShellHeader('/employee/projects/proj-1')).toEqual({
      showHeader: true,
      showBack: true,
      fallbackHref: '/employee/projects',
      titleKey: 'nav.projects',
    });
  });

  it('falls back to hours list from retroactive log form', () => {
    expect(resolveEmployeeShellHeader('/employee/hours/new')).toEqual({
      showHeader: true,
      showBack: true,
      fallbackHref: '/employee/hours',
      titleKey: 'nav.timeAndAttendance',
    });
  });

  it('uses employee referrer for safe history back', () => {
    vi.stubGlobal('window', { history: { length: 2 } });

    expect(
      shouldUseEmployeeHistoryBack('https://app.example/he-IL/employee', 'https://app.example'),
    ).toBe(true);
    expect(
      shouldUseEmployeeHistoryBack('https://app.example/he-IL/sign-in', 'https://app.example'),
    ).toBe(false);
    expect(shouldUseEmployeeHistoryBack(null, 'https://app.example')).toBe(false);
  });
});

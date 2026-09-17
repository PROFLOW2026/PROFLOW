const EMPLOYEE_HOME_PATH = '/employee';

const SECTION_TITLE_KEYS: Record<string, string> = {
  attendance: 'nav.attendance',
  hours: 'nav.hours',
  projects: 'nav.projects',
  tasks: 'nav.tasks',
  documents: 'nav.documents',
};

export interface EmployeeShellHeaderState {
  readonly showHeader: boolean;
  readonly showBack: boolean;
  readonly fallbackHref: string;
  readonly titleKey: string | null;
}

/** Resolve employee shell header/back targets from the locale-free app pathname. */
export function resolveEmployeeShellHeader(pathname: string): EmployeeShellHeaderState {
  const normalized = pathname.replace(/\/$/, '') || EMPLOYEE_HOME_PATH;

  if (normalized === EMPLOYEE_HOME_PATH) {
    return {
      showHeader: false,
      showBack: false,
      fallbackHref: EMPLOYEE_HOME_PATH,
      titleKey: null,
    };
  }

  if (!normalized.startsWith(`${EMPLOYEE_HOME_PATH}/`)) {
    return {
      showHeader: true,
      showBack: true,
      fallbackHref: EMPLOYEE_HOME_PATH,
      titleKey: null,
    };
  }

  const remainder = normalized.slice(`${EMPLOYEE_HOME_PATH}/`.length);
  const segments = remainder.split('/').filter(Boolean);
  const section = segments[0] ?? '';
  const hasNestedSegment = segments.length > 1;
  const fallbackHref = hasNestedSegment ? `${EMPLOYEE_HOME_PATH}/${section}` : EMPLOYEE_HOME_PATH;

  return {
    showHeader: true,
    showBack: true,
    fallbackHref,
    titleKey: SECTION_TITLE_KEYS[section] ?? null,
  };
}

/** True when browser history back is likely to stay inside the employee app. */
export function shouldUseEmployeeHistoryBack(referrer: string | null, origin: string): boolean {
  if (!referrer || typeof window === 'undefined') return false;
  if (window.history.length <= 1) return false;

  try {
    const url = new URL(referrer);
    return url.origin === origin && url.pathname.includes('/employee');
  } catch {
    return false;
  }
}

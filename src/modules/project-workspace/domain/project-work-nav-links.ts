export type ProjectWorkNavLabelKey =
  | 'tasks'
  | 'boards'
  | 'calendar'
  | 'timeline'
  | 'files'
  | 'meetings';

export type ProjectWorkNavLink =
  | { readonly kind: 'segment'; readonly segment: string; readonly labelKey: ProjectWorkNavLabelKey }
  | { readonly kind: 'documentsTab'; readonly labelKey: 'files' }
  | { readonly kind: 'meetings'; readonly labelKey: 'meetings' };

/** Six project-work nav actions (REG-007): 4 UWM segments + documents tab + site meetings. */
export const PROJECT_WORK_NAV_LINKS: readonly ProjectWorkNavLink[] = [
  { kind: 'segment', segment: 'tasks', labelKey: 'tasks' },
  { kind: 'segment', segment: 'boards', labelKey: 'boards' },
  { kind: 'segment', segment: 'calendar', labelKey: 'calendar' },
  { kind: 'segment', segment: 'timeline', labelKey: 'timeline' },
  { kind: 'documentsTab', labelKey: 'files' },
  { kind: 'meetings', labelKey: 'meetings' },
] as const;

export function projectWorkNavLinksForSurface(projectRoot: string): readonly ProjectWorkNavLink[] {
  if (projectRoot.startsWith('/employee/')) {
    return PROJECT_WORK_NAV_LINKS.filter((link) => link.labelKey !== 'timeline');
  }
  return PROJECT_WORK_NAV_LINKS;
}

export function projectWorkNavHref(projectRoot: string, link: ProjectWorkNavLink): string {
  switch (link.kind) {
    case 'segment': {
      const segment =
        link.segment === 'boards' && projectRoot.startsWith('/employee/') ? 'board' : link.segment;
      return `${projectRoot}/${segment}`;
    }
    case 'documentsTab':
      return projectRoot.startsWith('/employee/')
        ? `${projectRoot}/files`
        : `${projectRoot}?tab=documents`;
    case 'meetings':
      return `${projectRoot}/site-meetings`;
  }
}

export function projectWorkNavSegmentForActiveCheck(
  projectRoot: string,
  link: ProjectWorkNavLink,
): string | null {
  if (link.kind === 'segment') {
    return link.segment === 'boards' && projectRoot.startsWith('/employee/') ? 'board' : link.segment;
  }
  if (link.kind === 'documentsTab' && projectRoot.startsWith('/employee/')) {
    return 'files';
  }
  if (link.kind === 'meetings') {
    return 'site-meetings';
  }
  return null;
}

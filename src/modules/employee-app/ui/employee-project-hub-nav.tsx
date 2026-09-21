import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { employeeHubCardClass } from './employee-surface-styles';

export interface EmployeeProjectHubLink {
  readonly href: string;
  readonly label: string;
  readonly count?: number;
  readonly visible: boolean;
}

export async function buildEmployeeProjectHubLinks(input: {
  projectId: string;
  openTasks: number;
  canMeetings: boolean;
  canDocuments: boolean;
  canLogTime: boolean;
  canFinancials?: boolean;
}): Promise<EmployeeProjectHubLink[]> {
  const t = await getTranslations('employeeApp.projects');
  const { projectId, openTasks, canMeetings, canDocuments, canLogTime, canFinancials } = input;

  return [
    {
      href: `/employee/projects/${projectId}/tasks`,
      label: t('hub.tasks'),
      count: openTasks,
      visible: true,
    },
    {
      href: `/employee/projects/${projectId}/board`,
      label: t('hub.board'),
      count: openTasks,
      visible: true,
    },
    {
      href: `/employee/hours/new?projectId=${projectId}`,
      label: t('hub.logTime'),
      visible: canLogTime,
    },
    {
      href: `/employee/projects/${projectId}/files`,
      label: t('hub.files'),
      visible: canDocuments,
    },
    {
      href: `/employee/projects/${projectId}/meetings`,
      label: t('hub.meetings'),
      visible: canMeetings,
    },
    {
      href: `/employee/projects/${projectId}/financials`,
      label: t('hub.financials'),
      visible: Boolean(canFinancials),
    },
  ];
}

export function EmployeeProjectHubNav({ links }: { links: readonly EmployeeProjectHubLink[] }) {
  const visible = links.filter((link) => link.visible);

  return (
    <nav className="grid gap-2" aria-label="Project hub">
      {visible.map((link) => (
        <Link key={link.href} href={link.href} className={employeeHubCardClass}>
          <span className="text-base font-semibold text-[var(--pf-text-primary)]">{link.label}</span>
          {link.count !== undefined ? (
            <span className="rounded-full border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-text-primary)]">
              {link.count}
            </span>
          ) : (
            <span className="text-sm text-[var(--pf-text-muted)]" aria-hidden>
              →
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

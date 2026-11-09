import {
  CalendarClock,
  Camera,
  ChevronRight,
  ClipboardList,
  FileStack,
  FolderOpen,
  Kanban,
  ListChecks,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import type { ProjectOperationalToolLink } from '@/modules/project-workspace/domain/project-operational-tool-links';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import { employeeHubCardClass, employeeIconTileClass } from './employee-surface-styles';

export interface EmployeeProjectHubLink {
  readonly href: string;
  readonly label: string;
  readonly count?: number;
  readonly visible: boolean;
  readonly iconKey?: string;
}

function iconForHref(href: string): LucideIcon {
  if (href.includes('/tasks')) return ListChecks;
  if (href.includes('/team')) return Users;
  if (href.includes('/board')) return Kanban;
  if (href.includes('/hours')) return CalendarClock;
  if (href.includes('/files')) return FolderOpen;
  if (href.includes('/meetings')) return ClipboardList;
  if (href.includes('/financials')) return Wallet;
  if (href.includes('/infrastructure')) return Camera;
  if (href.includes('/rfi')) return ClipboardList;
  if (href.includes('/inspections')) return ClipboardList;
  if (href.includes('/defects')) return ClipboardList;
  if (href.includes('/plans')) return FileStack;
  if (href.includes('/submittals')) return FileStack;
  if (href.includes('/site-log') || href.includes('/field-ops/logs')) return ClipboardList;
  return FileStack;
}

export async function buildEmployeeProjectHubLinks(input: {
  projectId: string;
  openTasks: number;
  canMeetings: boolean;
  canDocuments: boolean;
  canLogTime: boolean;
  canFinancials?: boolean;
  canProjectTeam?: boolean;
  operationalToolLinks?: readonly ProjectOperationalToolLink[];
}): Promise<EmployeeProjectHubLink[]> {
  const t = await getTranslations('employeeApp.projects');
  const tNav = await getTranslations('employeeApp.nav');
  const tTools = await getTranslations('projectWorkspace');
  const { projectId, openTasks, canMeetings, canDocuments, canLogTime, canFinancials, canProjectTeam } =
    input;

  const operationalCards: EmployeeProjectHubLink[] = (input.operationalToolLinks ?? []).map((link) => ({
    href: link.href,
    label: tTools(`execution.hubLinks.${link.labelKey}` as never),
    visible: true,
  }));

  return [
    {
      href: `/employee/projects/${projectId}/tasks`,
      label: t('hub.tasks'),
      count: openTasks,
      visible: true,
    },
    {
      href: `/employee/projects/${projectId}/team`,
      label: tNav('team'),
      visible: Boolean(canProjectTeam),
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
    {
      href: `/employee/projects/${projectId}/infrastructure`,
      label: t('hub.infra'),
      visible: true,
    },
    ...operationalCards,
  ];
}

export async function EmployeeProjectHubNav({
  links,
}: {
  links: readonly EmployeeProjectHubLink[];
}) {
  const t = await getTranslations('employeeApp.projects');
  const visible = links.filter((link) => link.visible);

  return (
    <nav className="grid gap-2 sm:grid-cols-2" aria-label={t('hub.navAriaLabel')}>
      {visible.map((link) => {
        const Icon = iconForHref(link.href);
        return (
          <Link key={link.href} href={link.href} className={employeeHubCardClass}>
            <span className="flex min-w-0 items-center gap-3">
              <span className={employeeIconTileClass} aria-hidden>
                <Icon className="size-4" />
              </span>
              <span className="truncate text-sm font-semibold text-[var(--pf-text-primary)] md:text-base">
                {link.label}
              </span>
            </span>
            {link.count !== undefined ? (
              <span className="rounded-full border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--pf-text-primary)]">
                {link.count}
              </span>
            ) : (
              <ChevronRight
                className={rtlFlipClassName('size-4 text-[var(--pf-text-muted)]')}
                aria-hidden
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Local planning copy until Lead wires `planning` into MESSAGE_NAMESPACES.
 * Keys mirror `src/locales/{en,he-IL}/planning.json`.
 */

import arPlanning from '@/locales/ar/planning.json';
import ruPlanning from '@/locales/ru/planning.json';
import type { Locale } from '@/shared/i18n/config';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';

export type PlanningLocale = Locale;

export interface PlanningMessages {
  readonly title: string;
  readonly subtitle: string;
  readonly jobsOptOut: string;
  readonly empty: string;
  readonly emptyHint: string;
  readonly timeline: string;
  readonly overdue: string;
  readonly overdueCount: string;
  readonly progress: string;
  readonly milestone: string;
  readonly task: string;
  readonly dependency: string;
  readonly predecessors: string;
  readonly start: string;
  readonly targetEnd: string;
  readonly actualEnd: string;
  readonly workArea: string;
  readonly phase: string;
  readonly today: string;
  readonly criticalPathLimitation: string;
  readonly legendPlanned: string;
  readonly legendOverdue: string;
  readonly legendProgress: string;
  readonly legendMilestone: string;
  readonly noDates: string;
}

const HE: PlanningMessages = {
  title: 'תכנון ולוח זמנים',
  subtitle: 'תכנון קל: תאריכים, התקדמות, אבני דרך ותלויות סיום-להתחלה (FS) בלבד. לא MS Project ולא CPM.',
  jobsOptOut: 'תכנון מפורט זמין לפרויקטים בלבד. עבודות קצרות נשארות עם תאריכים פשוטים.',
  empty: 'עדיין אין פריטי תכנון עם תאריכים.',
  emptyHint: 'הוסיפו משימות או אבני דרך עם תאריך יעד לציר זמן קל. תלויות FS בלבד - אין נתיב קריטי.',
  timeline: 'ציר זמן',
  overdue: 'באיחור',
  overdueCount: '{count} באיחור',
  progress: 'התקדמות',
  milestone: 'אבן דרך',
  task: 'משימה',
  dependency: 'תלות',
  predecessors: 'קודמים',
  start: 'התחלה',
  targetEnd: 'יעד סיום',
  actualEnd: 'סיום בפועל',
  workArea: 'תחום עבודה',
  phase: 'שלב',
  today: 'היום',
  criticalPathLimitation:
    'תכנון קל בלבד: תלויות סיום-להתחלה (FS). אין נתיב קריטי, אין CPM, אין השהיה/הקדמה, ואין לוח עבודה. זה אינו MS Project.',
  legendPlanned: 'מתוכנן',
  legendOverdue: 'באיחור',
  legendProgress: 'התקדמות',
  legendMilestone: 'אבן דרך',
  noDates: 'ללא תאריכים',
};

const EN: PlanningMessages = {
  title: 'Planning & timeline',
  subtitle: 'Light planning: dates, progress, milestones, and finish-to-start (FS) links only. Not MS Project and not CPM.',
  jobsOptOut: 'Detailed planning is for projects only. Short jobs keep simple dates.',
  empty: 'No dated planning items yet.',
  emptyHint: 'Add tasks or milestones with a target date to see this light timeline. FS links only - no critical path.',
  timeline: 'Timeline',
  overdue: 'Overdue',
  overdueCount: '{count} overdue',
  progress: 'Progress',
  milestone: 'Milestone',
  task: 'Task',
  dependency: 'Dependency',
  predecessors: 'Predecessors',
  start: 'Start',
  targetEnd: 'Target end',
  actualEnd: 'Actual end',
  workArea: 'Work area',
  phase: 'Phase',
  today: 'Today',
  criticalPathLimitation:
    'Light planning only: finish-to-start (FS) dependencies. No critical path, no CPM, no lag/lead, and no working calendars. This is not MS Project.',
  legendPlanned: 'Planned',
  legendOverdue: 'Overdue',
  legendProgress: 'Progress',
  legendMilestone: 'Milestone',
  noDates: 'No dates',
};

function pickPlanningMessages(source: typeof arPlanning): PlanningMessages {
  return {
    title: source.title,
    subtitle: source.subtitle,
    jobsOptOut: source.jobsOptOut,
    empty: source.empty,
    emptyHint: source.emptyHint,
    timeline: source.timeline,
    overdue: source.overdue,
    overdueCount: source.overdueCount,
    progress: source.progress,
    milestone: source.milestone,
    task: source.task,
    dependency: source.dependency,
    predecessors: source.predecessors,
    start: source.start,
    targetEnd: source.targetEnd,
    actualEnd: source.actualEnd,
    workArea: source.workArea,
    phase: source.phase,
    today: source.today,
    criticalPathLimitation: source.criticalPathLimitation,
    legendPlanned: source.legendPlanned,
    legendOverdue: source.legendOverdue,
    legendProgress: source.legendProgress,
    legendMilestone: source.legendMilestone,
    noDates: source.noDates,
  };
}

const BY_LOCALE: Readonly<Record<Locale, PlanningMessages>> = {
  en: EN,
  'he-IL': HE,
  ar: pickPlanningMessages(arPlanning),
  ru: pickPlanningMessages(ruPlanning),
};

export function planningMessages(locale: PlanningLocale): PlanningMessages {
  return BY_LOCALE[resolveLabelLocale(locale)] ?? EN;
}

export function formatPlanningMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

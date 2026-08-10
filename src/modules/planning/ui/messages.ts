/**
 * Local planning copy until Lead wires `planning` into MESSAGE_NAMESPACES.
 * Keys mirror `src/locales/{en,he-IL}/planning.json`.
 */

export type PlanningLocale = 'he-IL' | 'en';

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
  subtitle: 'ציר זמן, תלויות, התקדמות ואבני דרך לפרויקט — לא שכפול של MS Project.',
  jobsOptOut: 'תכנון מפורט זמין לפרויקטים בלבד. עבודות קצרות נשארות עם תאריכים פשוטים.',
  empty: 'עדיין אין פריטי תכנון עם תאריכים.',
  emptyHint: 'הוסיפו משימות או אבני דרך עם תאריך יעד כדי לראות את הגאנט.',
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
    'נתיב קריטי אינו מוצג בגרסה זו — חסרים לוחות עבודה, השהיות וחישוב מרווח (ראו LIMITATION).',
  legendPlanned: 'מתוכנן',
  legendOverdue: 'באיחור',
  legendProgress: 'התקדמות',
  legendMilestone: 'אבן דרך',
  noDates: 'ללא תאריכים',
};

const EN: PlanningMessages = {
  title: 'Planning & timeline',
  subtitle: 'Timeline, dependencies, progress, and milestones — not an MS Project clone.',
  jobsOptOut: 'Detailed planning is for projects only. Short jobs keep simple dates.',
  empty: 'No dated planning items yet.',
  emptyHint: 'Add tasks or milestones with a target date to see the Gantt.',
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
    'Critical Path is not shown in this version — calendars, lag, and float are missing (see LIMITATION).',
  legendPlanned: 'Planned',
  legendOverdue: 'Overdue',
  legendProgress: 'Progress',
  legendMilestone: 'Milestone',
  noDates: 'No dates',
};

export function planningMessages(locale: PlanningLocale): PlanningMessages {
  return locale === 'en' ? EN : HE;
}

export function formatPlanningMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

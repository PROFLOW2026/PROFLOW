import {
  addDays,
  businessDate,
  endOfMonth,
  endOfWeek,
  startOfMonth,
  startOfWeek,
  type BusinessDate,
} from '@/shared/dates';

export const OPEN_TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'blocked'] as const;
export const ALL_TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
] as const;

export type TaskStatusFilter = 'open' | (typeof ALL_TASK_STATUSES)[number] | 'all';
export type TaskTimeFilter =
  | 'all'
  | 'today'
  | 'overdue'
  | 'this_week'
  | 'next_week'
  | 'this_month'
  | 'custom';
export type TaskAssigneeFilter = 'all' | 'me' | string;
export type TaskPriorityFilter = 'all' | 'none' | 'low' | 'medium' | 'high' | 'urgent';
export type TaskScopeFilter = 'mine' | 'company';

export type MeetingDateFilter =
  | 'all'
  | 'today'
  | 'upcoming'
  | 'past'
  | 'this_week'
  | 'this_month'
  | 'custom';
export type MeetingParticipationFilter = 'all' | 'mine' | 'project';

export interface EmployeeTaskListItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: string | null;
  readonly projectId: string | null;
  readonly projectDisplayName: string | null;
  readonly assigneeLabel: string;
  readonly assigneeEmployeeIds: readonly string[];
  readonly canPostpone: boolean;
}

export interface EmployeeMeetingListItem {
  readonly id: string;
  readonly title: string;
  readonly scheduledAt: string;
  readonly projectId: string | null;
  readonly projectDisplayName: string | null;
  readonly isAttendee: boolean;
}

export interface TaskFilterState {
  readonly scope: TaskScopeFilter;
  readonly status: TaskStatusFilter;
  readonly time: TaskTimeFilter;
  readonly projectId: string;
  readonly query: string;
  readonly assignee: TaskAssigneeFilter;
  readonly priority: TaskPriorityFilter;
  readonly dateFrom: string;
  readonly dateTo: string;
}

export interface MeetingFilterState {
  readonly date: MeetingDateFilter;
  readonly projectId: string;
  readonly query: string;
  readonly participation: MeetingParticipationFilter;
  readonly dateFrom: string;
  readonly dateTo: string;
}

export function defaultTaskFilterState(showAllAuthorizedTasks = false): TaskFilterState {
  return {
    scope: showAllAuthorizedTasks ? 'company' : 'mine',
    status: 'open',
    time: 'all',
    projectId: '',
    query: '',
    assignee: 'all',
    priority: 'all',
    dateFrom: '',
    dateTo: '',
  };
}

export function defaultMeetingFilterState(): MeetingFilterState {
  return {
    date: 'upcoming',
    projectId: '',
    query: '',
    participation: 'all',
    dateFrom: '',
    dateTo: '',
  };
}

export function parseTaskFilterState(
  params: URLSearchParams,
  showAllAuthorizedTasks = false,
): TaskFilterState {
  const defaults = defaultTaskFilterState(showAllAuthorizedTasks);
  const scopeParam = params.get('scope');
  const scope: TaskScopeFilter =
    scopeParam === 'mine' || scopeParam === 'company' ? scopeParam : defaults.scope;

  const statusParam = params.get('status') ?? defaults.status;
  const status = (
    statusParam === 'all' ||
    statusParam === 'open' ||
    (ALL_TASK_STATUSES as readonly string[]).includes(statusParam)
      ? statusParam
      : defaults.status
  ) as TaskStatusFilter;

  const timeParam = params.get('time') ?? defaults.time;
  const time = (
    [
      'all',
      'today',
      'overdue',
      'this_week',
      'next_week',
      'this_month',
      'custom',
    ] as const
  ).includes(timeParam as TaskTimeFilter)
    ? (timeParam as TaskTimeFilter)
    : defaults.time;

  return {
    scope,
    status,
    time,
    projectId: params.get('projectId') ?? defaults.projectId,
    query: params.get('q') ?? defaults.query,
    assignee: params.get('assignee') ?? defaults.assignee,
    priority: parsePriorityFilter(params.get('priority') ?? defaults.priority),
    dateFrom: params.get('from') ?? defaults.dateFrom,
    dateTo: params.get('to') ?? defaults.dateTo,
  };
}

export function parseMeetingFilterState(
  params: URLSearchParams,
  defaults: MeetingFilterState = defaultMeetingFilterState(),
): MeetingFilterState {
  const dateParam = params.get('date') ?? defaults.date;
  const date = (
    [
      'all',
      'today',
      'upcoming',
      'past',
      'this_week',
      'this_month',
      'custom',
    ] as const
  ).includes(dateParam as MeetingDateFilter)
    ? (dateParam as MeetingDateFilter)
    : defaults.date;

  const participationParam = params.get('participation') ?? defaults.participation;
  const participation = (['all', 'mine', 'project'] as const).includes(
    participationParam as MeetingParticipationFilter,
  )
    ? (participationParam as MeetingParticipationFilter)
    : defaults.participation;

  return {
    date,
    projectId: params.get('projectId') ?? defaults.projectId,
    query: params.get('q') ?? defaults.query,
    participation,
    dateFrom: params.get('from') ?? defaults.dateFrom,
    dateTo: params.get('to') ?? defaults.dateTo,
  };
}

function parsePriorityFilter(value: string): TaskPriorityFilter {
  if (
    value === 'all' ||
    value === 'none' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'urgent'
  ) {
    return value;
  }
  return 'all';
}

export function projectMatchesQuery(
  displayName: string | null | undefined,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  if (!displayName) return false;
  return displayName.toLowerCase().includes(normalized);
}

function taskTimeRange(
  filter: TaskTimeFilter,
  today: BusinessDate,
  dateFrom: string,
  dateTo: string,
): { from: BusinessDate | null; to: BusinessDate | null; overdueOnly?: boolean } {
  switch (filter) {
    case 'today':
      return { from: today, to: today };
    case 'overdue':
      return { from: null, to: addDays(today, -1), overdueOnly: true };
    case 'this_week':
      return { from: startOfWeek(today), to: endOfWeek(today) };
    case 'next_week': {
      const nextWeekStart = addDays(endOfWeek(today), 1);
      return { from: nextWeekStart, to: endOfWeek(nextWeekStart) };
    }
    case 'this_month':
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case 'custom': {
      const from = dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? businessDate(dateFrom) : null;
      const to = dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? businessDate(dateTo) : null;
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

function meetingInstantRange(
  filter: MeetingDateFilter,
  today: BusinessDate,
  dateFrom: string,
  dateTo: string,
): { from: Date | null; to: Date | null; upcomingOnly?: boolean; pastOnly?: boolean } {
  const startOfToday = new Date(`${today}T00:00:00.000Z`);
  const endOfToday = new Date(`${today}T23:59:59.999Z`);

  switch (filter) {
    case 'today':
      return { from: startOfToday, to: endOfToday };
    case 'upcoming':
      return { from: new Date(), to: null, upcomingOnly: true };
    case 'past':
      return { from: null, to: new Date(), pastOnly: true };
    case 'this_week':
      return {
        from: new Date(`${startOfWeek(today)}T00:00:00.000Z`),
        to: new Date(`${endOfWeek(today)}T23:59:59.999Z`),
      };
    case 'this_month':
      return {
        from: new Date(`${startOfMonth(today)}T00:00:00.000Z`),
        to: new Date(`${endOfMonth(today)}T23:59:59.999Z`),
      };
    case 'custom': {
      const from =
        dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)
          ? new Date(`${dateFrom}T00:00:00.000Z`)
          : null;
      const to =
        dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)
          ? new Date(`${dateTo}T23:59:59.999Z`)
          : null;
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

export function filterEmployeeTasks(
  tasks: readonly EmployeeTaskListItem[],
  filters: TaskFilterState,
  today: BusinessDate,
  currentEmployeeId: string,
): EmployeeTaskListItem[] {
  const range = taskTimeRange(filters.time, today, filters.dateFrom, filters.dateTo);

  return tasks.filter((task) => {
    if (filters.scope === 'mine' && !task.assigneeEmployeeIds.includes(currentEmployeeId)) {
      return false;
    }

    if (filters.status === 'open') {
      if (task.status === 'done' || task.status === 'cancelled') return false;
    } else if (filters.status !== 'all' && task.status !== filters.status) {
      return false;
    }

    if (filters.priority !== 'all' && task.priority !== filters.priority) return false;

    if (filters.projectId && task.projectId !== filters.projectId) return false;

    if (!projectMatchesQuery(task.projectDisplayName, filters.query)) return false;

    if (filters.assignee === 'me') {
      if (!task.assigneeEmployeeIds.includes(currentEmployeeId)) return false;
    } else if (filters.assignee !== 'all' && !task.assigneeEmployeeIds.includes(filters.assignee)) {
      return false;
    }

    if (filters.time !== 'all') {
      if (filters.time === 'overdue') {
        if (!task.dueDate) return false;
        const due = businessDate(task.dueDate);
        if (!(due < today && task.status !== 'done' && task.status !== 'cancelled')) return false;
      } else {
        if (!task.dueDate) return false;
        const due = businessDate(task.dueDate);
        if (range.from && due < range.from) return false;
        if (range.to && due > range.to) return false;
      }
    }

    return true;
  });
}

export function sortEmployeeTasks(
  tasks: readonly EmployeeTaskListItem[],
  today: BusinessDate,
): EmployeeTaskListItem[] {
  const rank = (task: EmployeeTaskListItem) => {
    if (task.status === 'done' || task.status === 'cancelled') return 4;
    if (task.dueDate && task.dueDate < today) return 0;
    if (task.dueDate === today) return 1;
    if (task.status === 'blocked') return 2;
    return 3;
  };

  return [...tasks].sort((a, b) => {
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.title.localeCompare(b.title);
  });
}

export function filterEmployeeMeetings(
  meetings: readonly EmployeeMeetingListItem[],
  filters: MeetingFilterState,
  today: BusinessDate,
): EmployeeMeetingListItem[] {
  const range = meetingInstantRange(filters.date, today, filters.dateFrom, filters.dateTo);

  return meetings.filter((meeting) => {
    if (filters.projectId && meeting.projectId !== filters.projectId) return false;
    if (!projectMatchesQuery(meeting.projectDisplayName, filters.query)) return false;

    if (filters.participation === 'mine' && !meeting.isAttendee) return false;
    if (filters.participation === 'project' && meeting.isAttendee) return false;

    const when = new Date(meeting.scheduledAt);
    if (range.upcomingOnly && when < new Date()) return false;
    if (range.pastOnly && when >= new Date()) return false;
    if (range.from && when < range.from) return false;
    if (range.to && when > range.to) return false;

    return true;
  });
}

export function sortEmployeeMeetings(
  meetings: readonly EmployeeMeetingListItem[],
  filters: MeetingFilterState,
): EmployeeMeetingListItem[] {
  const pastFirst =
    filters.date === 'past' ||
    (filters.date === 'custom' && meetings.every((m) => new Date(m.scheduledAt) < new Date()));

  return [...meetings].sort((a, b) => {
    const left = new Date(a.scheduledAt).getTime();
    const right = new Date(b.scheduledAt).getTime();
    if (pastFirst) return right - left;
    return left - right;
  });
}

export function taskFilterSearchParams(
  filters: TaskFilterState,
  defaults: TaskFilterState,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.scope !== defaults.scope) params.set('scope', filters.scope);
  if (filters.status !== defaults.status) params.set('status', filters.status);
  if (filters.time !== defaults.time) params.set('time', filters.time);
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.assignee !== defaults.assignee) params.set('assignee', filters.assignee);
  if (filters.priority !== defaults.priority) params.set('priority', filters.priority);
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  return params;
}

export function meetingFilterSearchParams(
  filters: MeetingFilterState,
  defaults: MeetingFilterState = defaultMeetingFilterState(),
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.date !== defaults.date) params.set('date', filters.date);
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.participation !== defaults.participation) params.set('participation', filters.participation);
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  return params;
}

function filterFieldDiffers<T>(left: T, right: T): boolean {
  return left !== right;
}

export function isTaskFilterActive(filters: TaskFilterState, defaults: TaskFilterState): boolean {
  return (
    filterFieldDiffers(filters.scope, defaults.scope) ||
    filterFieldDiffers(filters.status, defaults.status) ||
    filterFieldDiffers(filters.time, defaults.time) ||
    filterFieldDiffers(filters.projectId, defaults.projectId) ||
    filterFieldDiffers(filters.query.trim(), defaults.query.trim()) ||
    filterFieldDiffers(filters.assignee, defaults.assignee) ||
    filterFieldDiffers(filters.priority, defaults.priority) ||
    filterFieldDiffers(filters.dateFrom, defaults.dateFrom) ||
    filterFieldDiffers(filters.dateTo, defaults.dateTo)
  );
}

export function isMeetingFilterActive(
  filters: MeetingFilterState,
  defaults: MeetingFilterState = defaultMeetingFilterState(),
): boolean {
  return (
    filterFieldDiffers(filters.date, defaults.date) ||
    filterFieldDiffers(filters.projectId, defaults.projectId) ||
    filterFieldDiffers(filters.query.trim(), defaults.query.trim()) ||
    filterFieldDiffers(filters.participation, defaults.participation) ||
    filterFieldDiffers(filters.dateFrom, defaults.dateFrom) ||
    filterFieldDiffers(filters.dateTo, defaults.dateTo)
  );
}

export function countActiveTaskFilters(filters: TaskFilterState, defaults: TaskFilterState): number {
  let count = 0;
  if (filterFieldDiffers(filters.scope, defaults.scope)) count += 1;
  if (filterFieldDiffers(filters.status, defaults.status)) count += 1;
  if (filterFieldDiffers(filters.time, defaults.time)) count += 1;
  if (filters.projectId) count += 1;
  if (filters.query.trim()) count += 1;
  if (filterFieldDiffers(filters.assignee, defaults.assignee)) count += 1;
  if (filterFieldDiffers(filters.priority, defaults.priority)) count += 1;
  if (filters.dateFrom || filters.dateTo) count += 1;
  return count;
}

export function countActiveMeetingFilters(
  filters: MeetingFilterState,
  defaults: MeetingFilterState = defaultMeetingFilterState(),
): number {
  let count = 0;
  if (filterFieldDiffers(filters.date, defaults.date)) count += 1;
  if (filters.projectId) count += 1;
  if (filters.query.trim()) count += 1;
  if (filterFieldDiffers(filters.participation, defaults.participation)) count += 1;
  if (filters.dateFrom || filters.dateTo) count += 1;
  return count;
}

export function dueDateTone(
  dueDate: string | null,
  today: BusinessDate,
  status: string,
): 'overdue' | 'today' | 'future' | 'none' {
  if (!dueDate || status === 'done' || status === 'cancelled') return 'none';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'future';
}

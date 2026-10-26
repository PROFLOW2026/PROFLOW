import 'server-only';

import { getMyWorkPage } from '@/modules/tasks';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function formatIcsUtc(date: string): string {
  return `${date.replace(/-/g, '')}T120000Z`;
}

export async function buildMyWorkIcsFeed(context: OrgContext): Promise<string> {
  const today = todayInTimeZone(context.organization.timezone);
  const page = await getMyWorkPage(context, {
    view: 'assigned_to_me',
    today,
    limit: 500,
  });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EXLFY//My Work//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const task of page.tasks) {
    if (!task.dueDate) continue;
    const uid = `task-${task.id}@projectflow`;
    lines.push('BEGIN:VTODO');
    lines.push(`UID:${uid}`);
    lines.push(`SUMMARY:${escapeIcsText(task.title)}`);
    lines.push(`DUE;VALUE=DATE:${task.dueDate.replace(/-/g, '')}`);
    lines.push(`DTSTAMP:${formatIcsUtc(today)}`);
    lines.push('END:VTODO');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

import { z } from 'zod';
import { NATIVE_CALENDAR_EVENT_KINDS } from '../domain/types';

export const createCalendarEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(4000).nullable().optional(),
  eventKind: z.enum(NATIVE_CALENDAR_EVENT_KINDS).default('meeting'),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean().optional(),
  projectId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
});
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = createCalendarEventSchema.partial().extend({
  eventId: z.string().uuid(),
});
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

export const calendarEventIdSchema = z.object({
  eventId: z.string().uuid(),
});

export const listCalendarSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  view: z.enum(['month', 'agenda']).optional(),
});
export type ListCalendarInput = z.infer<typeof listCalendarSchema>;

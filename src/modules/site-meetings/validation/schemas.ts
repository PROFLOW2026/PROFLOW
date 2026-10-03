import { z } from 'zod';
import { SITE_MEETING_ATTENDANCE, SITE_MEETING_TYPES } from '@drizzle/schema';
import { optionalIsoDate, optionalText, optionalUuid } from '@/modules/site-log/shared/validation';

const meetingKey = { projectId: z.string().uuid(), meetingId: z.string().uuid() };

export const createSiteMeetingSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(300),
  meetingType: z.enum(SITE_MEETING_TYPES).default('weekly_contractor'),
  scheduledAt: z.coerce.date(),
  location: optionalText(300),
  agenda: optionalText(8000),
});
export type CreateSiteMeetingInput = z.input<typeof createSiteMeetingSchema>;

export const updateSiteMeetingSchema = z.object({
  ...meetingKey,
  title: z.string().trim().min(1, 'Title is required').max(300),
  meetingType: z.enum(SITE_MEETING_TYPES),
  scheduledAt: z.coerce.date(),
  location: optionalText(300),
  agenda: optionalText(8000),
});
export type UpdateSiteMeetingInput = z.input<typeof updateSiteMeetingSchema>;

export const updateMinutesSchema = z.object({ ...meetingKey, minutes: optionalText(20000) });

export const meetingKeySchema = z.object(meetingKey);

export const markHeldSchema = z.object({ ...meetingKey, heldAt: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.date().optional()) });

export const addInternalAttendeeSchema = z.object({ ...meetingKey, membershipId: z.string().uuid() });

export const removeInternalAttendeeSchema = z.object({ ...meetingKey, attendeeId: z.string().uuid() });

export const addContractorAttendeeSchema = z.object({
  ...meetingKey,
  vendorId: z.string().uuid(),
  subcontractAgreementId: optionalUuid,
  displayName: optionalText(200),
});

export const setContractorAttendanceSchema = z.object({
  ...meetingKey,
  attendeeId: z.string().uuid(),
  attendance: z.enum(SITE_MEETING_ATTENDANCE),
});

export const removeContractorAttendeeSchema = z.object({ ...meetingKey, attendeeId: z.string().uuid() });

export const recordDecisionSchema = z.object({
  ...meetingKey,
  title: z.string().trim().min(1, 'Title is required').max(300),
  body: optionalText(8000),
});

export const addActionItemSchema = z.object({
  ...meetingKey,
  title: z.string().trim().min(1, 'Title is required').max(300),
  dueDate: optionalIsoDate,
  assignee: optionalText(120),
  decisionId: optionalUuid,
  createTask: z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean()).default(true),
});
export type AddActionItemInput = z.input<typeof addActionItemSchema>;

export const listMeetingsFilterSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

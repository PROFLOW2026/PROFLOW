import { z } from 'zod';
import { BOOKING_STATUSES, SCHEDULING_VIEWS, UNAVAILABILITY_KINDS } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(4000).nullable().optional());
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const optionalBoolean = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'on' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

const optionalHours = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : value;
}, z.number().nonnegative().max(24 * 31).nullable().optional());

function parseDateTime(value: unknown): Date | unknown {
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms);
}

const requiredInstant = z.preprocess(parseDateTime, z.date());

export const listBoardSchema = z
  .object({
    from: requiredDate,
    to: requiredDate,
    view: z.enum(SCHEDULING_VIEWS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be on or after start date',
        path: ['to'],
      });
    }
  });

export type ListBoardInput = z.input<typeof listBoardSchema>;

const bookingWindowSchema = z
  .object({
    employeeId: z.string().uuid(),
    projectId: optionalUuid,
    workOrderId: optionalUuid,
    startAt: requiredInstant,
    endAt: requiredInstant,
    plannedHours: optionalHours,
    notes: optionalText,
    status: z.enum(BOOKING_STATUSES).optional(),
    confirmConflict: optionalBoolean,
  })
  .superRefine((value, ctx) => {
    if (value.endAt <= value.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End must be after start',
        path: ['endAt'],
      });
    }
  });

export const createBookingSchema = bookingWindowSchema;

export type CreateBookingInput = z.input<typeof createBookingSchema>;

export const updateBookingSchema = z
  .object({
    bookingId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    projectId: optionalUuid,
    workOrderId: optionalUuid,
    startAt: requiredInstant.optional(),
    endAt: requiredInstant.optional(),
    plannedHours: optionalHours,
    notes: optionalText,
    status: z.enum(['planned', 'confirmed']).optional(),
    confirmConflict: optionalBoolean,
  })
  .superRefine((value, ctx) => {
    if (value.startAt && value.endAt && value.endAt <= value.startAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End must be after start',
        path: ['endAt'],
      });
    }
  });

export type UpdateBookingInput = z.input<typeof updateBookingSchema>;

export const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
});

export type CancelBookingInput = z.input<typeof cancelBookingSchema>;

export const createUnavailabilitySchema = z
  .object({
    employeeId: z.string().uuid(),
    startDate: requiredDate,
    endDate: requiredDate,
    kind: z.enum(UNAVAILABILITY_KINDS).optional(),
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End date must be on or after start date',
        path: ['endDate'],
      });
    }
  });

export type CreateUnavailabilityInput = z.input<typeof createUnavailabilitySchema>;

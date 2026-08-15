/** Public API of the scheduling module (resource bookings / availability). */

export { listBoard } from './application/list-board';

export { createBooking, updateBooking, cancelBooking } from './application/bookings';
export type { MutateBookingResult } from './application/bookings';

export { createUnavailability } from './application/unavailability';

export {
  AVAILABILITY_SIGNALS,
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  SCHEDULING_VIEWS,
  UNAVAILABILITY_KINDS,
} from './domain/types';
export type {
  AvailabilitySignal,
  BookingSource,
  BookingStatus,
  EmployeeUnavailabilityRecord,
  ResourceBookingRecord,
  SchedulingView,
  UnavailabilityKind,
} from './domain/types';
export type {
  BoardAssignmentView,
  BoardBookingView,
  BoardDayCell,
  BoardEmployeeRow,
  BoardUnavailabilityView,
  SchedulingBoard,
} from './domain/board-view';

export {
  availabilityForDay,
  rankAvailability,
  worseAvailability,
} from './domain/availability';
export {
  DEFAULT_DAY_CAPACITY_HOURS,
  capacityHoursForDays,
  hoursBetween,
  hoursOnBusinessDate,
  isOverCapacity,
  resolvePlannedHours,
} from './domain/capacity';
export {
  anyPairOverlaps,
  bookingOverlapsUnavailability,
  bookingsConflict,
  findOverlappingDateRanges,
  findOverlappingIntervals,
  inclusiveDatesOverlap,
  instantsOverlap,
} from './domain/overlap';
export {
  endOfWeekSunday,
  enumerateBusinessDates,
  instantWindowForDates,
  startOfWeekSunday,
} from './domain/windows';

export {
  cancelBookingSchema,
  createBookingSchema,
  createUnavailabilitySchema,
  listBoardSchema,
  updateBookingSchema,
} from './validation/schemas';
export type {
  CancelBookingInput,
  CreateBookingInput,
  CreateUnavailabilityInput,
  ListBoardInput,
  UpdateBookingInput,
} from './validation/schemas';

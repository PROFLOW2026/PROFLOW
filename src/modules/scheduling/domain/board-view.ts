import type {
  AvailabilitySignal,
  BookingSource,
  BookingStatus,
  SchedulingView,
  UnavailabilityKind,
} from './types';

export interface BoardBookingView {
  readonly id: string | null;
  readonly projectionKey: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly workOrderId: string | null;
  readonly title: string | null;
  readonly startAt: string;
  readonly endAt: string;
  readonly plannedHours: number;
  readonly source: BookingSource;
  readonly status: BookingStatus;
  readonly notes: string | null;
  readonly readOnly: boolean;
}

export interface BoardUnavailabilityView {
  readonly id: string;
  readonly employeeId: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly kind: UnavailabilityKind;
  readonly notes: string | null;
}

export interface BoardAssignmentView {
  readonly assignmentId: string;
  readonly employeeId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly startDate: string;
  readonly endDate: string | null;
}

export interface BoardDayCell {
  readonly date: string;
  readonly signal: AvailabilitySignal;
  readonly plannedHours: number;
  readonly capacityHours: number;
  readonly bookings: BoardBookingView[];
  readonly unavailability: BoardUnavailabilityView[];
  readonly assignments: BoardAssignmentView[];
}

export interface BoardEmployeeRow {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly days: BoardDayCell[];
}

export interface SchedulingBoard {
  readonly from: string;
  readonly to: string;
  readonly view: SchedulingView;
  readonly days: string[];
  readonly employees: BoardEmployeeRow[];
  readonly canManage: boolean;
}

/**
 * Combine occupancy into a single availability signal for one employee-day.
 */

import type { AvailabilitySignal, Interval } from './types';
import { anyPairOverlaps } from './overlap';
import { DEFAULT_DAY_CAPACITY_HOURS } from './capacity';

const SIGNAL_RANK: Record<AvailabilitySignal, number> = {
  available: 0,
  partially_booked: 1,
  fully_booked: 2,
  over_capacity: 3,
  conflict: 4,
  unavailable: 5,
};

export function rankAvailability(signal: AvailabilitySignal): number {
  return SIGNAL_RANK[signal];
}

export function worseAvailability(
  left: AvailabilitySignal,
  right: AvailabilitySignal,
): AvailabilitySignal {
  return rankAvailability(left) >= rankAvailability(right) ? left : right;
}

export function availabilityForDay(input: {
  readonly unavailable: boolean;
  readonly intervals: readonly Interval[];
  readonly plannedHours: number;
  readonly capacityHours?: number;
}): AvailabilitySignal {
  if (input.unavailable) return 'unavailable';
  if (anyPairOverlaps(input.intervals)) return 'conflict';

  const capacity = input.capacityHours ?? DEFAULT_DAY_CAPACITY_HOURS;
  const hours = input.plannedHours;
  if (hours > capacity) return 'over_capacity';
  if (hours >= capacity && hours > 0) return 'fully_booked';
  if (hours > 0) return 'partially_booked';
  return 'available';
}

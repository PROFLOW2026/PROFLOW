import type { BadgeTone } from '@/components/ui/badge';
import type { CoordinationEventStatus } from '@drizzle/schema';
import type { EventReadinessState, PartyReadinessState } from '../domain/readiness';

export function readinessTone(state: EventReadinessState): BadgeTone {
  switch (state) {
    case 'ready':
      return 'success';
    case 'ready_with_conditions':
      return 'info';
    case 'waiting':
      return 'pending';
    case 'not_ready':
      return 'warning';
    case 'blocked':
      return 'danger';
  }
}

export function partyTone(state: PartyReadinessState): BadgeTone {
  switch (state) {
    case 'ready':
      return 'success';
    case 'ready_with_conditions':
      return 'info';
    case 'acknowledged':
      return 'brand';
    case 'not_ready':
      return 'warning';
    case 'blocked':
      return 'danger';
    case 'waiting':
      return 'pending';
  }
}

export function statusTone(status: CoordinationEventStatus): BadgeTone {
  switch (status) {
    case 'scheduled':
      return 'info';
    case 'completed':
      return 'success';
    case 'partially_completed':
      return 'warning';
    case 'postponed':
      return 'pending';
    case 'cancelled':
      return 'neutral';
  }
}

/** UI entry point for deliveries (kept apart from `index.ts` so domain imports never pull React). */
import type { StatusShape } from '@/components/ui/status-badge';
import type { DeliveryState } from './domain/types';

export function deliveryStateShape(state: DeliveryState, delayed: boolean): StatusShape {
  if (delayed && state !== 'delivered' && state !== 'cancelled' && state !== 'rejected') return 'overdue';
  switch (state) {
    case 'planned':
      return 'draft';
    case 'ordered':
      return 'active';
    case 'in_transit':
    case 'partially_delivered':
      return 'pending';
    case 'delivered':
      return 'completed';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
    default:
      return 'cancelled';
  }
}

import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import type { ServiceStatus } from '../domain/types';

const SHAPE: Record<ServiceStatus, StatusShape> = {
  new: 'draft',
  scheduled: 'active',
  in_progress: 'onHold',
  waiting: 'onHold',
  completed: 'completed',
  cancelled: 'cancelled',
};

export function WorkOrderStatusBadge({
  status,
  label,
}: {
  status: ServiceStatus;
  label: string;
}) {
  return <StatusBadge shape={SHAPE[status]} label={label} />;
}

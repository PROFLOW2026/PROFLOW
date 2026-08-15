import type { StatusShape } from '@/components/ui/status-badge';
import type { SafetyActionStatus, SafetyRecordStatus, SafetySeverity } from '../domain/types';

export function safetyRecordStatusShape(status: SafetyRecordStatus): StatusShape {
  switch (status) {
    case 'open':
      return 'active';
    case 'in_progress':
      return 'pending';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'draft';
  }
}

export function safetyActionStatusShape(
  status: SafetyActionStatus,
  overdue: boolean,
): StatusShape {
  if (overdue && (status === 'open' || status === 'in_progress')) return 'overdue';
  switch (status) {
    case 'open':
      return 'active';
    case 'in_progress':
      return 'pending';
    case 'done':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'draft';
  }
}

export function safetySeverityShape(severity: SafetySeverity): StatusShape {
  switch (severity) {
    case 'low':
      return 'draft';
    case 'medium':
      return 'pending';
    case 'high':
      return 'onHold';
    case 'critical':
      return 'rejected';
    default:
      return 'draft';
  }
}

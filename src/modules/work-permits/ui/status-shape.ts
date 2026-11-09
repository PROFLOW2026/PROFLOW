import type { StatusShape } from '@/components/ui/status-badge';
import type { WorkPermitStatus } from '../domain/types';

export function workPermitStatusShape(status: WorkPermitStatus): StatusShape {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'submitted':
      return 'pending';
    case 'closed':
      return 'completed';
    default:
      return 'draft';
  }
}

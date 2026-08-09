import type { StatusShape } from '@/components/ui/status-badge';
import type { ArtifactStatus } from '../domain/types';

/** Maps compliance expiry status to shared StatusBadge shapes. */
export function complianceStatusShape(status: ArtifactStatus): StatusShape {
  switch (status) {
    case 'valid':
      return 'approved';
    case 'expiring_soon':
      return 'onHold';
    case 'expired':
      return 'overdue';
    case 'revoked':
      return 'cancelled';
    case 'pending':
      return 'pending';
    default:
      return 'draft';
  }
}

import type { StatusShape } from '@/components/ui/status-badge';
import type { ComplianceReviewStatus, ComplianceStatus } from '../domain/types';

export function complianceStatusShape(status: ComplianceStatus): StatusShape {
  switch (status) {
    case 'current':
      return 'approved';
    case 'expiring':
      return 'onHold';
    case 'expired':
      return 'overdue';
    case 'missing':
    default:
      return 'rejected';
  }
}

export function complianceReviewShape(status: ComplianceReviewStatus): StatusShape {
  switch (status) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    case 'pending_review':
    default:
      return 'pending';
  }
}

import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { SubcontractClaimStatus } from '../domain/types';

const TONE: Record<SubcontractClaimStatus, BadgeTone> = {
  draft: 'neutral',
  submitted: 'pending',
  under_review: 'warning',
  returned: 'danger',
  certified: 'success',
  cancelled: 'neutral',
};

export function ClaimStatusBadge({ status, label }: { status: SubcontractClaimStatus; label: string }) {
  return <Badge tone={TONE[status]}>{label}</Badge>;
}

import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { AgreementLifecycleStatus, SubcontractChangeStatus, UnpricedWorkStatus } from '../domain/types';

const AGREEMENT_TONE: Record<AgreementLifecycleStatus, BadgeTone> = {
  draft: 'neutral',
  active: 'success',
  suspended: 'warning',
  completed: 'info',
  closed: 'neutral',
  cancelled: 'danger',
};

const CHANGE_TONE: Record<SubcontractChangeStatus, BadgeTone> = {
  draft: 'neutral',
  submitted: 'pending',
  under_negotiation: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

const UNPRICED_TONE: Record<UnpricedWorkStatus, BadgeTone> = {
  recorded: 'warning',
  converted: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export function AgreementStatusBadge({ status, label }: { status: AgreementLifecycleStatus; label: string }) {
  return <Badge tone={AGREEMENT_TONE[status]}>{label}</Badge>;
}

export function ChangeStatusBadge({ status, label }: { status: SubcontractChangeStatus; label: string }) {
  return <Badge tone={CHANGE_TONE[status]}>{label}</Badge>;
}

export function UnpricedStatusBadge({ status, label }: { status: UnpricedWorkStatus; label: string }) {
  return <Badge tone={UNPRICED_TONE[status]}>{label}</Badge>;
}

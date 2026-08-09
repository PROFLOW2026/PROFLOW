'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import type { ChangeRequestStatus } from '../domain/types';

const STATUS_SHAPES: Record<ChangeRequestStatus, StatusShape> = {
  draft: 'draft',
  awaiting_approval: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

export interface ChangeStatusBadgeProps {
  status: ChangeRequestStatus;
  sentAt?: Date | string | null;
}

export function ChangeStatusBadge({ status, sentAt }: ChangeStatusBadgeProps) {
  const t = useTranslations('changes.status');
  const label = sentAt && status === 'awaiting_approval' ? t('awaitingApprovalSent') : t(status);

  return <StatusBadge shape={STATUS_SHAPES[status]} label={label} />;
}

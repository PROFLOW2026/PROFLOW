'use client';

import { useTranslations } from 'next-intl';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import type { BillingRecordStatus, CollectionStatus } from '@/modules/billing/domain/types';

interface BillingStatusBadgeProps {
  status: BillingRecordStatus;
  collectionStatus?: CollectionStatus | null;
  className?: string;
}

export function BillingStatusBadge({ status, collectionStatus, className }: BillingStatusBadgeProps) {
  const tBilling = useTranslations('status.billing');
  const tPayment = useTranslations('status.payment');

  if (status === 'draft' || status === 'void') {
    const shape: StatusShape = status === 'draft' ? 'draft' : 'void';
    return <StatusBadge className={className} shape={shape} label={tBilling(status)} />;
  }

  if (collectionStatus) {
    const shapeMap: Record<CollectionStatus, StatusShape> = {
      open: 'pending',
      partial: 'pending',
      paid: 'approved',
      overdue: 'overdue',
    };
    return (
      <StatusBadge
        className={className}
        shape={shapeMap[collectionStatus]}
        label={tPayment(collectionStatus)}
      />
    );
  }

  return <StatusBadge className={className} shape="approved" label={tBilling('finalized')} />;
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { deleteBillingPlanAction } from './billing-plan-actions';

interface DeleteBillingPlanButtonProps {
  readonly projectId: string;
  readonly planId: string;
  readonly canDelete: boolean;
}

export function DeleteBillingPlanButton({
  projectId,
  planId,
  canDelete,
}: DeleteBillingPlanButtonProps) {
  const t = useTranslations('billingPlan');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canDelete) return null;

  function onDelete() {
    if (!window.confirm(t('delete.confirm'))) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBillingPlanAction({ projectId, planId });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="danger"
        size="sm"
        loading={pending}
        onClick={onDelete}
        data-testid="delete-billing-plan"
      >
        {t('delete.action')}
      </Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

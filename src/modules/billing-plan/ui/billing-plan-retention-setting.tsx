'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { updateBillingPlanAction } from './billing-plan-actions';

interface BillingPlanRetentionSettingProps {
  readonly projectId: string;
  readonly planId: string;
  readonly defaultRetentionPercent: string;
  readonly canManage: boolean;
}

/**
 * Global retention for the billing plan — applied automatically to every account.
 */
export function BillingPlanRetentionSetting({
  projectId,
  planId,
  defaultRetentionPercent,
  canManage,
}: BillingPlanRetentionSettingProps) {
  const t = useTranslations('billingPlan');
  const router = useRouter();
  const [value, setValue] = useState(defaultRetentionPercent || '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    if (!canManage) return;
    setError(null);
    startTransition(async () => {
      const result = await updateBillingPlanAction({
        projectId,
        planId,
        defaultRetentionPercent: next.trim() || null,
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div
      className="flex min-w-0 flex-wrap items-end gap-3 text-sm"
      data-testid="billing-plan-retention-setting"
    >
      <Field label={t('retention.globalLabel')} className="min-w-[8rem]">
        {(control) => (
          <div className="flex items-center gap-1">
            <Input
              {...control}
              inputMode="decimal"
              dir="ltr"
              className="w-20"
              value={value}
              disabled={!canManage || pending}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => {
                if (value !== (defaultRetentionPercent || '')) save(value);
              }}
            />
            <span className="text-[var(--pf-text-muted)]">%</span>
          </div>
        )}
      </Field>
      <p className="min-w-0 flex-1 text-xs text-[var(--pf-text-muted)]">{t('retention.globalHint')}</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}

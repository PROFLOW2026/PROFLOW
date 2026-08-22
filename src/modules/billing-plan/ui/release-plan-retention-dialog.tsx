'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useRouter } from '@/shared/i18n/navigation';
import { useTranslations } from 'next-intl';
import { MoneyInput, formatMoneyAmountForInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { compareMoney, isPositiveMoney, money } from '@/shared/money';
import {
  releasePlanRetentionAction,
  type BillingPlanActionState,
} from './billing-plan-actions';

interface ReleasePlanRetentionDialogProps {
  readonly projectId: string;
  readonly planId: string;
  readonly currency: string;
  readonly heldRemaining: string;
  readonly defaultReleaseDate: string;
}

export function ReleasePlanRetentionDialog({
  projectId,
  planId,
  currency,
  heldRemaining,
  defaultReleaseDate,
}: ReleasePlanRetentionDialogProps) {
  const t = useTranslations('billingPlan');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [state, formAction, pending] = useActionState<BillingPlanActionState, FormData>(
    releasePlanRetentionAction,
    {},
  );

  const held = useMemo(() => money(heldRemaining || '0', currency), [heldRemaining, currency]);
  const canRelease = isPositiveMoney(held);
  const overRelease =
    amount.trim() !== '' &&
    isPositiveMoney(money(amount, currency)) &&
    compareMoney(money(amount, currency), held) > 0;

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      setAmount('');
      router.refresh();
    }
  }, [state.success, router]);

  useEffect(() => {
    if (open) {
      setAmount(formatMoneyAmountForInput(heldRemaining, currency));
    }
  }, [open, heldRemaining, currency]);

  if (!canRelease) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]" data-testid="retention-none-held">
        {t('retention.noneHeld')}
      </p>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" data-testid="release-retention-trigger">
          {t('retention.releaseAction')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('retention.releaseTitle')}</DialogTitle>
          <DialogDescription>{t('retention.releaseDescription')}</DialogDescription>
        </DialogHeader>
        <form action={formAction}>
          <DialogBody className="flex flex-col gap-4">
            {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
            {state.success && state.message ? (
              <Alert tone="success">{state.message}</Alert>
            ) : null}
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="amount" value={amount} />

            <div className="text-sm">
              <p className="text-[var(--pf-text-muted)]">{t('retention.heldTitle')}</p>
              <MoneyText value={held} />
              <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                {t('retention.maxHint', {
                  amount: formatMoneyAmountForInput(heldRemaining, currency),
                })}
              </p>
            </div>

            <Field label={t('retention.amountLabel')} required>
              {(control) => (
                <MoneyInput
                  {...control}
                  value={amount}
                  onValueChange={setAmount}
                  data-testid="release-retention-amount"
                />
              )}
            </Field>
            {overRelease ? (
              <Alert tone="danger">{t('retention.overRelease')}</Alert>
            ) : null}

            <Field label={t('retention.dateLabel')} required>
              {(control) => (
                <Input
                  {...control}
                  name="releasedOn"
                  type="date"
                  dir="ltr"
                  defaultValue={defaultReleaseDate}
                  max={defaultReleaseDate}
                  required
                />
              )}
            </Field>

            <Field label={t('retention.notesLabel')} optionalLabel={tCommon('labels.optional')}>
              {(control) => <Textarea {...control} name="notes" rows={2} />}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" loading={pending} disabled={!amount || overRelease}>
              {t('retention.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

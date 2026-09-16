'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmPaymentButton } from '@/components/ui/confirm-payment-button';
import type { CommandCenterItem } from '@/modules/command-center';
import {
  confirmTodayPaymentAction,
  dismissCommandCenterItemAction,
  handleCommandCenterItemAction,
  snoozeCommandCenterItemAction,
} from '@/app/[locale]/(app)/today/actions';

export interface CommandCenterItemActionLabels {
  readonly handle: string;
  readonly dismiss: string;
  readonly snooze1d: string;
  readonly snooze7d: string;
  readonly notNow: string;
  readonly financialGuard: string;
  readonly confirmPaid: string;
  readonly paymentDateLabel: string;
  readonly paymentDateHint: string;
  readonly paymentConfirm: string;
  readonly cancel: string;
}

export function CommandCenterItemActions({
  item,
  labels,
  defaultPaymentDate,
}: {
  readonly item: CommandCenterItem;
  readonly labels: CommandCenterItemActionLabels;
  readonly defaultPaymentDate: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isMonthlyReport = item.sourceType === 'monthly_workforce_report_ready';

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {item.confirmPaid ? (
        <ConfirmPaymentButton
          label={labels.confirmPaid}
          paymentDateLabel={labels.paymentDateLabel}
          paymentDateHint={labels.paymentDateHint}
          confirmLabel={labels.paymentConfirm}
          cancelLabel={labels.cancel}
          defaultPaymentDate={defaultPaymentDate}
          disabled={pending}
          onConfirm={async (paidAt) => {
            await confirmTodayPaymentAction({
              sourceType: item.sourceType,
              sourceId: item.sourceId,
              paidAt,
            });
            router.refresh();
          }}
        />
      ) : null}
      {item.allowHandle ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              if (isMonthlyReport) {
                await dismissCommandCenterItemAction({
                  itemKey: item.itemKey,
                  sourceType: item.sourceType,
                  sourceId: item.sourceId,
                });
              } else {
                await handleCommandCenterItemAction({
                  itemKey: item.itemKey,
                  sourceType: item.sourceType,
                  sourceId: item.sourceId,
                });
              }
              router.refresh();
            });
          }}
        >
          {isMonthlyReport ? labels.dismiss : labels.handle}
        </Button>
      ) : null}
      {item.allowSnooze ? (
        <>
          {!isMonthlyReport ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  await snoozeCommandCenterItemAction({
                    itemKey: item.itemKey,
                    sourceType: item.sourceType,
                    sourceId: item.sourceId,
                    snoozeDays: 1,
                  });
                  router.refresh();
                });
              }}
            >
              {labels.snooze1d}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await snoozeCommandCenterItemAction({
                  itemKey: item.itemKey,
                  sourceType: item.sourceType,
                  sourceId: item.sourceId,
                  snoozeDays: isMonthlyReport ? 7 : 7,
                });
                router.refresh();
              });
            }}
          >
            {isMonthlyReport ? labels.notNow : labels.snooze7d}
          </Button>
        </>
      ) : null}
      {item.isFinancial && !item.confirmPaid ? (
        <p className="w-full text-xs text-[var(--pf-text-muted)]">{labels.financialGuard}</p>
      ) : null}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { CommandCenterItem } from '@/modules/command-center';
import {
  handleCommandCenterItemAction,
  snoozeCommandCenterItemAction,
} from '@/app/[locale]/(app)/today/actions';

export interface CommandCenterItemActionLabels {
  readonly handle: string;
  readonly snooze1d: string;
  readonly snooze7d: string;
  readonly financialGuard: string;
}

export function CommandCenterItemActions({
  item,
  labels,
}: {
  readonly item: CommandCenterItem;
  readonly labels: CommandCenterItemActionLabels;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {item.allowHandle ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              await handleCommandCenterItemAction({
                itemKey: item.itemKey,
                sourceType: item.sourceType,
                sourceId: item.sourceId,
              });
              router.refresh();
            });
          }}
        >
          {labels.handle}
        </Button>
      ) : null}
      {item.allowSnooze ? (
        <>
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
                  snoozeDays: 7,
                });
                router.refresh();
              });
            }}
          >
            {labels.snooze7d}
          </Button>
        </>
      ) : null}
      {item.isFinancial ? (
        <p className="w-full text-xs text-[var(--pf-text-muted)]">{labels.financialGuard}</p>
      ) : null}
    </div>
  );
}

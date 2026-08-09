'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PUNCH_PRIORITIES, type PunchPriority } from '@/modules/field-ops/domain/types';
import { updatePunchPriorityAction, type FieldOpsFormState } from '../actions';

export function PunchPriorityForm({
  punchListItemId,
  currentPriority,
}: {
  punchListItemId: string;
  currentPriority: PunchPriority;
}) {
  const t = useTranslations('fieldOps');
  const tPriorities = useTranslations('fieldOps.priorities');
  const [priority, setPriority] = useState(currentPriority);
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    updatePunchPriorityAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="punchListItemId" value={punchListItemId} />
      <input type="hidden" name="priority" value={priority} />
      <Select value={priority} onValueChange={(value) => setPriority(value as PunchPriority)}>
        <SelectTrigger className="min-h-11 w-full sm:w-[9rem] md:h-9 md:min-h-9" aria-label={t('updatePriority.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PUNCH_PRIORITIES.map((value) => (
            <SelectItem key={value} value={value}>
              {tPriorities(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={pending || priority === currentPriority}
        className="min-h-11 md:min-h-8"
      >
        {pending ? t('updatePriority.pending') : t('updatePriority.submit')}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

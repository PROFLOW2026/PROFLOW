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
import {
  PUNCH_STATUSES,
  type PunchStatus,
} from '@/modules/field-ops/domain/types';
import { canTransitionPunchStatus } from '@/modules/field-ops/domain/punch-status';
import { updatePunchStatusAction, type FieldOpsFormState } from '../actions';

export function PunchStatusForm({
  punchListItemId,
  currentStatus,
}: {
  punchListItemId: string;
  currentStatus: PunchStatus;
}) {
  const t = useTranslations('fieldOps');
  const tStatus = useTranslations('status.punch');
  const [status, setStatus] = useState(currentStatus);
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    updatePunchStatusAction,
    {},
  );

  const options = PUNCH_STATUSES.filter(
    (value) => value === currentStatus || canTransitionPunchStatus(currentStatus, value),
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="punchListItemId" value={punchListItemId} />
      <input type="hidden" name="status" value={status} />
      <Select value={status} onValueChange={(value) => setStatus(value as PunchStatus)}>
        <SelectTrigger className="min-h-11 w-full sm:w-[10rem] md:h-9 md:min-h-9" aria-label={t('updateStatus.label')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((value) => (
            <SelectItem key={value} value={value}>
              {tStatus(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="secondary" disabled={pending || status === currentStatus} className="min-h-11 md:min-h-8">
        {pending ? t('updateStatus.pending') : t('updateStatus.submit')}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

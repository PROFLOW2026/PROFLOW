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
  INSPECTION_STATUSES,
  type InspectionStatus,
  canTransitionInspectionStatus,
} from '@/modules/field-ops';
import { updateInspectionStatusAction, type FieldOpsFormState } from '../actions';

export function InspectionStatusForm({
  inspectionId,
  currentStatus,
}: {
  inspectionId: string;
  currentStatus: InspectionStatus;
}) {
  const t = useTranslations('fieldOps');
  const tStatus = useTranslations('status.inspection');
  const [status, setStatus] = useState(currentStatus);
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    updateInspectionStatusAction,
    {},
  );

  const options = INSPECTION_STATUSES.filter(
    (value) => value === currentStatus || canTransitionInspectionStatus(currentStatus, value),
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="status" value={status} />
      <Select value={status} onValueChange={(value) => setStatus(value as InspectionStatus)}>
        <SelectTrigger className="h-9 w-[10rem]" aria-label={t('updateStatus.label')}>
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
      <Button type="submit" size="sm" variant="secondary" disabled={pending || status === currentStatus}>
        {pending ? t('updateStatus.pending') : t('updateStatus.submit')}
      </Button>
      {state.error ? <span className="text-sm text-[var(--pf-danger)]">{state.error}</span> : null}
    </form>
  );
}

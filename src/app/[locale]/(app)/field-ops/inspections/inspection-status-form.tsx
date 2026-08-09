'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
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
} from '@/modules/field-ops/domain/types';
import {
  canTransitionInspectionStatus,
  isCompletedInspectionStatus,
} from '@/modules/field-ops/domain/inspection-status';
import { updateInspectionStatusAction, type FieldOpsFormState } from '../actions';

export function InspectionStatusForm({
  inspectionId,
  currentStatus,
  currentResult,
  compact = false,
}: {
  inspectionId: string;
  currentStatus: InspectionStatus;
  currentResult?: string | null;
  compact?: boolean;
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
  const needsResult = isCompletedInspectionStatus(status);

  return (
    <form
      action={formAction}
      className={
        compact
          ? 'flex flex-col gap-2'
          : 'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end'
      }
    >
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <input type="hidden" name="status" value={status} />
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(value) => setStatus(value as InspectionStatus)}>
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
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={pending || status === currentStatus}
          className="min-h-11 md:min-h-8"
        >
          {pending ? t('updateStatus.pending') : t('updateStatus.submit')}
        </Button>
      </div>
      {needsResult ? (
        <Field label={t('updateStatus.resultLabel')} className="w-full min-w-[12rem]">
          {(control) => (
            <Textarea
              {...control}
              name="result"
              rows={compact ? 2 : 3}
              defaultValue={currentResult ?? ''}
              placeholder={t('updateStatus.resultPlaceholder')}
            />
          )}
        </Field>
      ) : null}
      {state.error ? (
        <span role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SERVICE_STATUSES, type ServiceStatus } from '@/modules/service/domain/types';
import { updateServiceStatusAction, type WorkOrderFormState } from '../actions';

export function WorkOrderStatusForm({
  workOrderId,
  currentStatus,
}: {
  workOrderId: string;
  currentStatus: ServiceStatus;
}) {
  const t = useTranslations('service');
  const [state, formAction, pending] = useActionState<WorkOrderFormState, FormData>(
    updateServiceStatusAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4 sm:flex-row sm:items-end"
    >
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <Field label={t('create.quickStatusLabel')} className="min-w-0 flex-1">
        {(control) => (
          <Select name="serviceStatus" defaultValue={currentStatus}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVICE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Button type="submit" variant="secondary" loading={pending}>
        {t('workspace.updateStatus')}
      </Button>
      {state.error ? <Alert tone="danger" className="w-full">{state.error}</Alert> : null}
      {state.success ? (
        <Alert tone="success" className="w-full">
          {t('workspace.saved')}
        </Alert>
      ) : null}
    </form>
  );
}

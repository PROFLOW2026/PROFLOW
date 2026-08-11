'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  SERVICE_PRIORITIES,
  SERVICE_STATUSES,
  type ServicePriority,
  type ServiceStatus,
} from '@/modules/service/domain/types';
import { updateWorkOrderAction, type WorkOrderFormState } from '../actions';

interface WorkOrderDetailFormProps {
  workOrderId: string;
  initial: {
    name: string;
    description: string;
    siteAddress: string;
    contactName: string;
    contactPhone: string;
    category: string;
    priority: ServicePriority;
    requestedDate: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    serviceNotes: string;
    notes: string;
    serviceStatus: ServiceStatus;
  };
}

export function WorkOrderDetailForm({ workOrderId, initial }: WorkOrderDetailFormProps) {
  const t = useTranslations('service');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<WorkOrderFormState, FormData>(
    updateWorkOrderAction,
    {},
  );

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('workspace.saved')}</Alert> : null}

      <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => <Input {...control} name="name" required defaultValue={initial.name} />}
      </Field>

      <Field label={t('create.siteLabel')} error={state.fieldErrors?.siteAddress}>
        {(control) => (
          <Input {...control} name="siteAddress" defaultValue={initial.siteAddress} />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('create.contactNameLabel')} error={state.fieldErrors?.contactName}>
          {(control) => (
            <Input {...control} name="contactName" defaultValue={initial.contactName} />
          )}
        </Field>
        <Field label={t('create.contactPhoneLabel')} error={state.fieldErrors?.contactPhone}>
          {(control) => (
            <Input {...control} name="contactPhone" dir="ltr" defaultValue={initial.contactPhone} />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('create.categoryLabel')} error={state.fieldErrors?.category}>
          {(control) => <Input {...control} name="category" defaultValue={initial.category} />}
        </Field>
        <Field label={t('create.priorityLabel')}>
          {(control) => (
            <Select name="priority" defaultValue={initial.priority}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {t(`priority.${priority}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <Field label={t('create.statusLabel')}>
        {(control) => (
          <Select name="serviceStatus" defaultValue={initial.serviceStatus}>
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

      <Field label={t('create.requestedDateLabel')} error={state.fieldErrors?.requestedDate}>
        {(control) => (
          <Input
            {...control}
            name="requestedDate"
            type="date"
            dir="ltr"
            defaultValue={initial.requestedDate}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('create.windowStartLabel')} error={state.fieldErrors?.scheduledStartAt}>
          {(control) => (
            <Input
              {...control}
              name="scheduledStartAt"
              type="datetime-local"
              dir="ltr"
              defaultValue={initial.scheduledStartAt}
            />
          )}
        </Field>
        <Field label={t('create.windowEndLabel')} error={state.fieldErrors?.scheduledEndAt}>
          {(control) => (
            <Input
              {...control}
              name="scheduledEndAt"
              type="datetime-local"
              dir="ltr"
              defaultValue={initial.scheduledEndAt}
            />
          )}
        </Field>
      </div>

      <Field label={tCommon('labels.description')} error={state.fieldErrors?.description}>
        {(control) => (
          <Textarea {...control} name="description" rows={2} defaultValue={initial.description} />
        )}
      </Field>

      <Field label={t('create.notesLabel')} error={state.fieldErrors?.serviceNotes}>
        {(control) => (
          <Textarea {...control} name="serviceNotes" rows={2} defaultValue={initial.serviceNotes} />
        )}
      </Field>

      <Button type="submit" loading={pending}>
        {tCommon('actions.save')}
      </Button>
    </form>
  );
}

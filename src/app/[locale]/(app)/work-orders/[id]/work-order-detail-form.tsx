'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
import { WorkOrderChecklistField } from '@/modules/service/ui/work-order-checklist-field';
import { updateWorkOrderAction, type WorkOrderFormState } from '../actions';

interface WorkOrderDetailFormProps {
  workOrderId: string;
  checklistTemplates: { id: string; name: string }[];
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
    checklistTemplateId: string | null;
  };
}

export function WorkOrderDetailForm({
  workOrderId,
  checklistTemplates,
  initial,
}: WorkOrderDetailFormProps) {
  const t = useTranslations('service');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<WorkOrderFormState, FormData>(
    updateWorkOrderAction,
    {},
  );

  return (
    <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
      <input type="hidden" name="workOrderId" value={workOrderId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('workspace.saved')}</Alert> : null}

      <MainAppFormGrid dense>
      <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name} className={mainAppFieldSpan.lg}>
        {(control) => <Input {...control} name="name" required defaultValue={initial.name} />}
      </Field>

      <Field label={t('create.siteLabel')} error={state.fieldErrors?.siteAddress} className={mainAppFieldSpan.lg}>
        {(control) => (
          <Input {...control} name="siteAddress" defaultValue={initial.siteAddress} />
        )}
      </Field>

        <Field label={t('create.contactNameLabel')} error={state.fieldErrors?.contactName} className={mainAppFieldSpan.lg}>
          {(control) => (
            <Input {...control} name="contactName" defaultValue={initial.contactName} />
          )}
        </Field>
        <Field label={t('create.contactPhoneLabel')} error={state.fieldErrors?.contactPhone} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input {...control} name="contactPhone" dir="ltr" defaultValue={initial.contactPhone} />
          )}
        </Field>

        <Field label={t('create.categoryLabel')} error={state.fieldErrors?.category} className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="category" defaultValue={initial.category} />}
        </Field>
        <Field label={t('create.priorityLabel')} className={mainAppFieldSpan.md}>
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

      <div className={mainAppFieldSpan.full}>
        <WorkOrderChecklistField
          templates={checklistTemplates}
          defaultTemplateId={initial.checklistTemplateId}
          error={state.fieldErrors?.checklistTemplateId}
        />
      </div>

      <Field label={t('create.statusLabel')} className={mainAppFieldSpan.md}>
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

      <Field label={t('create.requestedDateLabel')} error={state.fieldErrors?.requestedDate} className={mainAppFieldSpan.md}>
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

        <Field label={t('create.windowStartLabel')} error={state.fieldErrors?.scheduledStartAt} className={mainAppFieldSpan.lg}>
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
        <Field label={t('create.windowEndLabel')} error={state.fieldErrors?.scheduledEndAt} className={mainAppFieldSpan.lg}>
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

      <Field label={tCommon('labels.description')} error={state.fieldErrors?.description} className={mainAppFieldSpan.full}>
        {(control) => (
          <Textarea {...control} name="description" rows={2} defaultValue={initial.description} />
        )}
      </Field>

      <Field label={t('create.notesLabel')} error={state.fieldErrors?.serviceNotes} className={mainAppFieldSpan.full}>
        {(control) => (
          <Textarea {...control} name="serviceNotes" rows={2} defaultValue={initial.serviceNotes} />
        )}
      </Field>
      </MainAppFormGrid>

      <Button type="submit" loading={pending}>
        {tCommon('actions.save')}
      </Button>
    </form>
  );
}

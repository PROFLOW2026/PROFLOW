'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PROJECT_STATUSES, type ProjectDetail } from '@/modules/projects';
import { updateProjectAction, type ProjectFormState } from '../actions';

interface DetailsTabProps {
  detail: ProjectDetail;
  clients: { id: string; name: string }[];
}

export function DetailsTab({ detail, clients }: DetailsTabProps) {
  const t = useTranslations('projects.details');
  const tStatus = useTranslations('status.project');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    updateProjectAction,
    {},
  );

  const { project } = detail;

  return (
    <form action={formAction} className="mx-auto flex max-w-xl flex-col gap-4">
      <input type="hidden" name="projectId" value={project.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={tCommon('labels.name')} required error={state.fieldErrors?.name}>
        {(control) => <Input {...control} name="name" defaultValue={project.name} required />}
      </Field>

      <Field label={t('statusLabel')}>
        {(control) => (
          <Select name="status" defaultValue={project.status}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_STATUSES.filter((status) => status !== 'archived').map((status) => (
                <SelectItem key={status} value={status}>
                  {tStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('clientLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Select name="clientId" defaultValue={project.clientId ?? 'none'}>
            <SelectTrigger id={control.id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{tCommon('labels.none')}</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('domainLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="domainName" defaultValue={detail.domainName ?? ''} />
        )}
      </Field>

      <Field label={t('locationLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="location" defaultValue={project.location ?? ''} />}
      </Field>

      <Field label={t('startDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="startDate" type="date" defaultValue={project.startDate ?? ''} />
        )}
      </Field>

      <Field label={t('targetEndDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="targetEndDate"
            type="date"
            defaultValue={project.targetEndDate ?? ''}
          />
        )}
      </Field>

      <Field label={t('actualEndDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="actualEndDate"
            type="date"
            defaultValue={project.actualEndDate ?? ''}
          />
        )}
      </Field>

      <Field label={t('roleLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="projectRole" defaultValue={project.projectRole ?? ''} />
        )}
      </Field>

      <Field label={t('deliveryModeLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="deliveryMode" defaultValue={project.deliveryMode ?? ''} />
        )}
      </Field>

      <Field label={t('descriptionLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Textarea {...control} name="description" rows={3} defaultValue={project.description ?? ''} />
        )}
      </Field>

      <Field label={t('notesLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Textarea {...control} name="notes" rows={2} defaultValue={project.notes ?? ''} />
        )}
      </Field>

      <Button type="submit" loading={pending}>
        {t('save')}
      </Button>
    </form>
  );
}

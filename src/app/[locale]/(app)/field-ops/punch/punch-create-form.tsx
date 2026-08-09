'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PUNCH_PRIORITIES, type PunchPriority } from '@/modules/field-ops';
import { createPunchListItemAction, type FieldOpsFormState } from '../actions';

export function PunchCreateForm({
  projects,
  defaultProjectId,
}: {
  projects: readonly { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  const t = useTranslations('fieldOps.createPunch');
  const tPriorities = useTranslations('fieldOps.priorities');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    createPunchListItemAction,
    {},
  );
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [priority, setPriority] = useState<PunchPriority>('normal');

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('projectLabel')} required>
        {(control) => (
          <>
            <input type="hidden" name="projectId" value={projectId} />
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id={control.id}>
                <SelectValue placeholder={t('projectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('titleLabel')} required error={state.fieldErrors?.title}>
        {(control) => <Input {...control} name="title" required autoFocus />}
      </Field>

      <Field label={t('descriptionLabel')} error={state.fieldErrors?.description}>
        {(control) => <Textarea {...control} name="description" rows={3} />}
      </Field>

      <Field label={t('priorityLabel')}>
        {(control) => (
          <>
            <input type="hidden" name="priority" value={priority} />
            <Select value={priority} onValueChange={(v) => setPriority(v as PunchPriority)}>
              <SelectTrigger id={control.id}>
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
          </>
        )}
      </Field>

      <Field label={t('locationLabel')}>
        {(control) => <Input {...control} name="location" />}
      </Field>

      <Field label={t('dueDateLabel')}>
        {(control) => <Input {...control} type="date" name="dueDate" />}
      </Field>

      <Button type="submit" disabled={pending || !projectId}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}

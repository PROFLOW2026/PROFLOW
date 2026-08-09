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
import { createDailyLogAction, type FieldOpsFormState } from '../actions';

export function DailyLogCreateForm({
  projects,
  defaultProjectId,
  defaultLogDate,
}: {
  projects: readonly { id: string; name: string }[];
  defaultProjectId?: string;
  defaultLogDate: string;
}) {
  const t = useTranslations('fieldOps.createLog');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    createDailyLogAction,
    {},
  );
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('projectLabel')} required error={state.fieldErrors?.projectId}>
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

      <Field label={t('logDateLabel')} required error={state.fieldErrors?.logDate}>
        {(control) => (
          <Input {...control} type="date" name="logDate" defaultValue={defaultLogDate} required />
        )}
      </Field>

      <Field label={t('weatherLabel')} error={state.fieldErrors?.weather}>
        {(control) => <Input {...control} name="weather" />}
      </Field>

      <Field label={t('summaryLabel')} required error={state.fieldErrors?.summary}>
        {(control) => <Textarea {...control} name="summary" rows={4} required />}
      </Field>

      <Field label={t('workforceNotesLabel')} error={state.fieldErrors?.workforceNotes}>
        {(control) => <Textarea {...control} name="workforceNotes" rows={3} />}
      </Field>

      <Button type="submit" disabled={pending || !projectId}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}

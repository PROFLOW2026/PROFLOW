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
import { INSPECTION_KINDS, type InspectionKind } from '@/modules/field-ops';
import { createInspectionAction, type FieldOpsFormState } from '../actions';

export function InspectionCreateForm({
  projects,
  defaultProjectId,
}: {
  projects: readonly { id: string; name: string }[];
  defaultProjectId?: string;
}) {
  const t = useTranslations('fieldOps.createInspection');
  const tKinds = useTranslations('fieldOps.kinds');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    createInspectionAction,
    {},
  );
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [kind, setKind] = useState<InspectionKind>('general');

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

      <Field label={t('kindLabel')}>
        {(control) => (
          <>
            <input type="hidden" name="kind" value={kind} />
            <Select value={kind} onValueChange={(v) => setKind(v as InspectionKind)}>
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INSPECTION_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {tKinds(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('scheduledOnLabel')}>
        {(control) => <Input {...control} type="date" name="scheduledOn" />}
      </Field>

      <Field label={t('notesLabel')}>
        {(control) => <Textarea {...control} name="notes" rows={3} />}
      </Field>

      <Button type="submit" disabled={pending || !projectId}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}

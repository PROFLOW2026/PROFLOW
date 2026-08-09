'use client';

import { useActionState, useMemo, useState } from 'react';
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
import {
  INSPECTION_KINDS,
  type FieldOpsWorkPackageOption,
  type InspectionKind,
} from '@/modules/field-ops/domain/types';
import { createInspectionAction, type FieldOpsFormState } from '../actions';
import { FieldOpsPhotoLimitationNote } from '../field-ops-photo-limitation-note';

const NONE = '__none__';

export function InspectionCreateForm({
  projects,
  workPackages,
  defaultProjectId,
}: {
  projects: readonly { id: string; name: string }[];
  workPackages: readonly FieldOpsWorkPackageOption[];
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
  const [workPackageId, setWorkPackageId] = useState(NONE);
  const [kind, setKind] = useState<InspectionKind>('general');

  const projectPackages = useMemo(
    () => workPackages.filter((pkg) => pkg.projectId === projectId),
    [workPackages, projectId],
  );

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('projectLabel')} required>
        {(control) => (
          <>
            <input type="hidden" name="projectId" value={projectId} />
            <Select
              value={projectId}
              onValueChange={(value) => {
                setProjectId(value);
                setWorkPackageId(NONE);
              }}
            >
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

      {projectPackages.length > 0 ? (
        <Field label={t('workPackageLabel')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="workPackageId"
                value={workPackageId === NONE ? '' : workPackageId}
              />
              <Select value={workPackageId} onValueChange={setWorkPackageId}>
                <SelectTrigger id={control.id}>
                  <SelectValue placeholder={t('workPackagePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('workPackageNone')}</SelectItem>
                  {projectPackages.map((pkg) => (
                    <SelectItem key={pkg.id} value={pkg.id}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : null}

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

      <FieldOpsPhotoLimitationNote />

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending || !projectId}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}

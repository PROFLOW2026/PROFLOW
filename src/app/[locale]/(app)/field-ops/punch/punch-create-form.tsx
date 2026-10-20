'use client';

import { useActionState, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
  PUNCH_PRIORITIES,
  type FieldOpsWorkPackageOption,
  type PunchPriority,
} from '@/modules/field-ops/domain/types';
import { punchPayloadFromFormData } from '@/modules/offline/domain/payloads';
import { Link } from '@/shared/i18n/navigation';
import { createPunchListItemAction, type FieldOpsFormState } from '../actions';
import {
  FieldOpsPhotoStaging,
  useFieldOpsCreateFormAction,
  useStagedCreatePhotos,
} from '../field-ops-photo-staging';

const NONE = '__none__';

export function PunchCreateForm({
  projects,
  workPackages,
  defaultProjectId,
  canManageDocuments,
  storageConfigured,
  employees,
}: {
  projects: readonly { id: string; name: string }[];
  workPackages: readonly FieldOpsWorkPackageOption[];
  defaultProjectId?: string;
  canManageDocuments: boolean;
  storageConfigured: boolean;
  employees: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('fieldOps.createPunch');
  const tPriorities = useTranslations('fieldOps.priorities');
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');
  const photos = useStagedCreatePhotos();
  const offlineSuccessState = useMemo<FieldOpsFormState>(() => ({ offlineQueued: true }), []);
  const wrappedAction = useFieldOpsCreateFormAction<FieldOpsFormState>({
    kind: 'punch',
    onlineAction: createPunchListItemAction,
    buildPayload: punchPayloadFromFormData,
    offlineSuccessState,
    missingOrgError: tOffline('errors.missingOrganization'),
    appendPhotos: photos.appendToFormData,
  });
  const [state, formAction, pending] = useActionState<FieldOpsFormState, FormData>(
    wrappedAction,
    {},
  );
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [workPackageId, setWorkPackageId] = useState(NONE);
  const [priority, setPriority] = useState<PunchPriority>('normal');
  const [assigneeEmployeeId, setAssigneeEmployeeId] = useState(NONE);

  const projectPackages = useMemo(
    () => workPackages.filter((pkg) => pkg.projectId === projectId),
    [workPackages, projectId],
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.offlineQueued ? (
        <Alert tone="info" role="status">
          {tOffline('forms.draftSaved')}{' '}
          <Link href="/settings/offline-drafts" className="font-medium underline">
            {tOffline('banner.viewDrafts')}
          </Link>
        </Alert>
      ) : null}

      <MainAppFormGrid dense className="gap-4">
      <Field label={t('projectLabel')} required className={mainAppFieldSpan.lg}>
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
        <Field label={t('workPackageLabel')} className={mainAppFieldSpan.lg}>
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

      <Field label={t('titleLabel')} required error={state.fieldErrors?.title} className={mainAppFieldSpan.full}>
        {(control) => <Input {...control} name="title" required autoFocus />}
      </Field>

      <Field label={t('descriptionLabel')} error={state.fieldErrors?.description} className={mainAppFieldSpan.full}>
        {(control) => <Textarea {...control} name="description" rows={3} />}
      </Field>

      <Field label={t('priorityLabel')} className={mainAppFieldSpan.lg}>
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

      <Field label={t('locationLabel')} className={mainAppFieldSpan.lg}>
        {(control) => <Input {...control} name="location" />}
      </Field>

      <Field label={t('dueDateLabel')} className={mainAppFieldSpan.md}>
        {(control) => <Input {...control} type="date" name="dueDate" className="min-h-11" />}
      </Field>

      <Field label={t('assigneeLabel')} className={mainAppFieldSpan.lg}>
        {(control) => (
          <>
            <input
              type="hidden"
              name="assigneeEmployeeId"
              value={assigneeEmployeeId === NONE ? '' : assigneeEmployeeId}
            />
            <Select value={assigneeEmployeeId} onValueChange={setAssigneeEmployeeId}>
              <SelectTrigger id={control.id} className="min-h-11">
                <SelectValue placeholder={t('assigneeNone')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('assigneeNone')}</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>
      </MainAppFormGrid>

      <FieldOpsPhotoStaging
        files={photos.files}
        onFilesChange={photos.setFiles}
        canManageDocuments={canManageDocuments}
        storageConfigured={storageConfigured}
        disabled={pending}
      />

      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending || !projectId}>
        {pending ? tCommon('states.saving') : t('submit')}
      </Button>
    </form>
  );
}

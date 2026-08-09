'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_WORK_PACKAGE_NAME,
  type PhaseRecord,
  type WorkPackageRecord,
} from '@/modules/projects/domain/types';
import type { ProjectDetail } from '@/modules/projects/application/get-project-detail';
import type {
  OrgPhasePack,
  OrgStructureTemplatePreview,
  OrgWorkPackagePack,
} from '@/modules/tenancy/domain/org-structure-templates';
import {
  addWorkPackageAction,
  applyOrgPhasePackAction,
  applyOrgWorkPackagePackAction,
  createPhaseAction,
  splitProjectAction,
  updatePhaseScheduleAction,
  updateWorkPackageProgressAction,
  type ProjectFormState,
} from '../actions';
import { CloneProjectStructureForm } from './clone-project-structure-form';
import { ProjectTemplateApplyForm } from './project-template-apply-form';

interface WorkTabProps {
  detail: ProjectDetail;
  canEdit?: boolean;
  locale?: 'en' | 'he-IL';
  orgTemplates?: readonly OrgStructureTemplatePreview[];
  phasePacks?: readonly OrgPhasePack[];
  workPackagePacks?: readonly OrgWorkPackagePack[];
  cloneCandidates?: readonly { id: string; name: string }[];
}

export function WorkTab({
  detail,
  canEdit = false,
  locale = 'en',
  orgTemplates = [],
  phasePacks = [],
  workPackagePacks = [],
  cloneCandidates = [],
}: WorkTabProps) {
  const t = useTranslations('projects.workPackages');

  if (!detail.showWorkPackages) {
    return (
      <div className="flex flex-col gap-4">
        <SplitProjectForm projectId={detail.project.id} />
        {canEdit ? (
          <>
            <ProjectTemplateApplyForm
              projectId={detail.project.id}
              locale={locale}
              orgTemplates={orgTemplates}
            />
            <CloneProjectStructureForm
              projectId={detail.project.id}
              candidates={cloneCandidates}
            />
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {detail.workPackages.map((pkg) => {
        const phases = detail.phases.filter((phase) => phase.workPackageId === pkg.id);
        return (
          <Card key={pkg.id}>
            <CardHeader>
              <CardTitle>
                {pkg.isDefault && pkg.name === DEFAULT_WORK_PACKAGE_NAME
                  ? t('defaultName')
                  : pkg.name}
              </CardTitle>
              {pkg.description ? <CardDescription>{pkg.description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <PhaseList
                phases={phases}
                projectId={detail.project.id}
                canEdit={canEdit}
              />
              {canEdit ? (
                <>
                  <WorkPackageScheduleForm projectId={detail.project.id} workPackage={pkg} />
                  <AddPhaseForm projectId={detail.project.id} workPackageId={pkg.id} />
                  {phasePacks.length > 0 ? (
                    <ApplyPhasePackForm
                      projectId={detail.project.id}
                      workPackageId={pkg.id}
                      packs={phasePacks}
                    />
                  ) : null}
                </>
              ) : pkg.progressPercent || pkg.startDate || pkg.endDate ? (
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {[pkg.startDate, pkg.endDate].filter(Boolean).join(' → ') || null}
                  {pkg.progressPercent
                    ? `${pkg.startDate || pkg.endDate ? ' · ' : ''}${t('progressPercent')}: ${pkg.progressPercent}%`
                    : null}
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {canEdit ? (
        <>
          <AddWorkPackageForm projectId={detail.project.id} />
          {workPackagePacks.length > 0 ? (
            <ApplyWorkPackagePackForm
              projectId={detail.project.id}
              packs={workPackagePacks}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PhaseList({
  phases,
  projectId,
  canEdit,
}: {
  phases: readonly PhaseRecord[];
  projectId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('projects.workPackages');
  if (phases.length === 0) {
    return (
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('phases')}: {t('emptyPhases')}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 text-sm text-[var(--pf-text-secondary)]">
      <li className="font-medium text-[var(--pf-text-primary)]">{t('phases')}</li>
      {phases.map((phase) =>
        canEdit ? (
          <li key={phase.id}>
            <PhaseScheduleForm projectId={projectId} phase={phase} />
          </li>
        ) : (
          <li key={phase.id}>
            {phase.name}
            {phase.startDate || phase.endDate
              ? ` · ${[phase.startDate, phase.endDate].filter(Boolean).join(' → ')}`
              : null}
          </li>
        ),
      )}
    </ul>
  );
}

function PhaseScheduleForm({
  projectId,
  phase,
}: {
  projectId: string;
  phase: PhaseRecord;
}) {
  const t = useTranslations('projects.workPackages');
  const tDetails = useTranslations('projects.details');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    updatePhaseScheduleAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="phaseId" value={phase.id} />
      {state.error ? <Alert tone="danger" className="sm:col-span-4">{state.error}</Alert> : null}
      <div className="flex items-end text-sm font-medium text-[var(--pf-text-primary)] sm:col-span-1">
        {phase.name}
      </div>
      <Field label={tDetails('startDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="startDate" type="date" defaultValue={phase.startDate ?? ''} />
        )}
      </Field>
      <Field label={t('endDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="endDate" type="date" defaultValue={phase.endDate ?? ''} />
        )}
      </Field>
      <div className="flex items-end">
        <Button type="submit" variant="ghost" size="sm" loading={pending}>
          {t('savePhaseDates')}
        </Button>
      </div>
    </form>
  );
}

function ApplyPhasePackForm({
  projectId,
  workPackageId,
  packs,
}: {
  projectId: string;
  workPackageId: string;
  packs: readonly OrgPhasePack[];
}) {
  const t = useTranslations('projects.templates');
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    applyOrgPhasePackAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-[var(--pf-border-default)] pt-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="workPackageId" value={workPackageId} />
      <input type="hidden" name="phasePackId" value={packId} />
      {state.error ? <Alert tone="danger" className="w-full">{state.error}</Alert> : null}
      <Field label={t('phasePack')}>
        {(control) => (
          <Select value={packId} onValueChange={setPackId}>
            <SelectTrigger id={control.id} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {packs.map((pack) => (
                <SelectItem key={pack.id} value={pack.id}>
                  {pack.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        {t('applyPhasePack')}
      </Button>
    </form>
  );
}

function ApplyWorkPackagePackForm({
  projectId,
  packs,
}: {
  projectId: string;
  packs: readonly OrgWorkPackagePack[];
}) {
  const t = useTranslations('projects.templates');
  const [packId, setPackId] = useState(packs[0]?.id ?? '');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    applyOrgWorkPackagePackAction,
    {},
  );

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="workPackagePackId" value={packId} />
      {state.error ? <Alert tone="danger" className="w-full">{state.error}</Alert> : null}
      <Field label={t('wpPack')}>
        {(control) => (
          <Select value={packId} onValueChange={setPackId}>
            <SelectTrigger id={control.id} className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {packs.map((pack) => (
                <SelectItem key={pack.id} value={pack.id}>
                  {pack.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={pending}>
        {t('applyWpPack')}
      </Button>
    </form>
  );
}

function WorkPackageScheduleForm({
  projectId,
  workPackage,
}: {
  projectId: string;
  workPackage: WorkPackageRecord;
}) {
  const t = useTranslations('projects.workPackages');
  const tDetails = useTranslations('projects.details');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    updateWorkPackageProgressAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="workPackageId" value={workPackage.id} />
      {state.error ? <Alert tone="danger" className="sm:col-span-4">{state.error}</Alert> : null}
      <Field label={tDetails('startDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="startDate" type="date" defaultValue={workPackage.startDate ?? ''} />
        )}
      </Field>
      <Field label={t('endDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input {...control} name="endDate" type="date" defaultValue={workPackage.endDate ?? ''} />
        )}
      </Field>
      <Field label={tDetails('progressPercent')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="progressPercent"
            inputMode="decimal"
            numeric
            dir="ltr"
            defaultValue={workPackage.progressPercent ?? ''}
          />
        )}
      </Field>
      <div className="flex items-end">
        <Button type="submit" variant="secondary" size="sm" loading={pending}>
          {t('saveSchedule')}
        </Button>
      </div>
    </form>
  );
}

function AddPhaseForm({
  projectId,
  workPackageId,
}: {
  projectId: string;
  workPackageId: string;
}) {
  const t = useTranslations('projects.workPackages');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    createPhaseAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-2 border-t border-[var(--pf-border-default)] pt-3 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="workPackageId" value={workPackageId} />
      {state.error ? <Alert tone="danger" className="sm:col-span-2">{state.error}</Alert> : null}
      <Field label={t('phaseName')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="name" required placeholder={t('phaseNamePlaceholder')} />}
      </Field>
      <div className="flex items-end">
        <Button type="submit" variant="ghost" size="sm" loading={pending}>
          {t('addPhase')}
        </Button>
      </div>
    </form>
  );
}

function SplitProjectForm({ projectId }: { projectId: string }) {
  const t = useTranslations('projects.workPackages');
  const tWork = useTranslations('projects.work');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    splitProjectAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('splitCta')}</CardTitle>
        <CardDescription>{t('splitDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <Field label={t('renameDefault')}>
            {(control) => <Input {...control} name="defaultPackageName" />}
          </Field>
          <Field label={t('add')} description={t('splitDescription')}>
            {(control) => (
              <Textarea
                {...control}
                name="additionalPackages"
                rows={4}
                placeholder={tWork('areasPlaceholder')}
              />
            )}
          </Field>
          <Button type="submit" loading={pending}>
            {t('splitCta')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AddWorkPackageForm({ projectId }: { projectId: string }) {
  const t = useTranslations('projects.workPackages');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    addWorkPackageAction,
    {},
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('add')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <Field label={tCommon('labels.name')} required>
            {(control) => <Input {...control} name="name" required />}
          </Field>
          <Button type="submit" loading={pending} variant="secondary">
            {t('add')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

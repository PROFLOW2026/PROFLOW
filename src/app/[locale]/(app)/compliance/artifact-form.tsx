'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ARTIFACT_KINDS,
  SUBJECT_TYPES,
  type ArtifactKind,
  type ComplianceArtifactRecord,
  type SubjectType,
} from '@/modules/compliance/domain/types';
import { STATUS_MODE_VALUES } from '@/modules/compliance/validation/schemas';
import {
  createComplianceArtifactAction,
  updateComplianceArtifactAction,
  type ComplianceFormState,
} from './actions';

type StatusMode = (typeof STATUS_MODE_VALUES)[number];

export interface SubjectOption {
  readonly id: string;
  readonly name: string;
}

export interface ComplianceSubjectOptions {
  readonly projects: readonly SubjectOption[];
  readonly vendors: readonly SubjectOption[];
  readonly employees: readonly SubjectOption[];
}

function initialStatusMode(artifact?: ComplianceArtifactRecord): StatusMode {
  if (!artifact) return 'auto';
  if (artifact.status === 'pending' || artifact.status === 'revoked') return artifact.status;
  return 'auto';
}

interface ArtifactFormProps {
  mode: 'create' | 'edit';
  artifact?: ComplianceArtifactRecord;
  subjects?: ComplianceSubjectOptions;
}

export function ArtifactForm({
  mode,
  artifact,
  subjects = { projects: [], vendors: [], employees: [] },
}: ArtifactFormProps) {
  const t = useTranslations('compliance');
  const tForm = useTranslations('compliance.form');
  const tCommon = useTranslations('common');
  const action = mode === 'create' ? createComplianceArtifactAction : updateComplianceArtifactAction;
  const [state, formAction, pending] = useActionState<ComplianceFormState, FormData>(action, {});

  const [kind, setKind] = useState<ArtifactKind>(artifact?.artifactKind ?? 'insurance');
  const [subjectType, setSubjectType] = useState<SubjectType>(artifact?.subjectType ?? 'organization');
  const [subjectId, setSubjectId] = useState<string>(artifact?.subjectId ?? 'none');
  const [statusMode, setStatusMode] = useState<StatusMode>(initialStatusMode(artifact));

  const subjectOptions =
    subjectType === 'project'
      ? subjects.projects
      : subjectType === 'vendor'
        ? subjects.vendors
        : subjectType === 'employee'
          ? subjects.employees
          : [];

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {artifact ? <input type="hidden" name="artifactId" value={artifact.id} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={tForm('nameLabel')} required error={state.fieldErrors?.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            defaultValue={artifact?.name ?? ''}
            placeholder={tForm('namePlaceholder')}
            autoFocus
            required
          />
        )}
      </Field>

      <Field label={tForm('kindLabel')} required>
        {(control) => (
          <>
            <input type="hidden" name="artifactKind" value={kind} />
            <Select value={kind} onValueChange={(value) => setKind(value as ArtifactKind)}>
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ARTIFACT_KINDS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`kinds.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={tForm('subjectTypeLabel')} required>
        {(control) => (
          <>
            <input type="hidden" name="subjectType" value={subjectType} />
            <Select
              value={subjectType}
              onValueChange={(value) => {
                setSubjectType(value as SubjectType);
                setSubjectId('none');
              }}
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUBJECT_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`subjects.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      {subjectType !== 'organization' ? (
        <Field
          label={tForm('subjectIdLabel')}
          description={tForm('subjectIdHint')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.subjectId}
        >
          {(control) => (
            <>
              <input type="hidden" name="subjectId" value={subjectId === 'none' ? '' : subjectId} />
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue placeholder={tForm('subjectNone')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tForm('subjectNone')}</SelectItem>
                  {subjectOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>
      ) : (
        <input type="hidden" name="subjectId" value="" />
      )}

      <Field
        label={tForm('referenceLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.referenceNumber}
      >
        {(control) => (
          <Input
            {...control}
            name="referenceNumber"
            defaultValue={artifact?.referenceNumber ?? ''}
          />
        )}
      </Field>

      <Field
        label={tForm('issuerLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.issuer}
      >
        {(control) => (
          <Input {...control} name="issuer" defaultValue={artifact?.issuer ?? ''} />
        )}
      </Field>

      <Field label={tForm('issuedOnLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="issuedOn"
            type="date"
            defaultValue={artifact?.issuedOn ?? ''}
          />
        )}
      </Field>

      <Field label={tForm('expiresOnLabel')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="expiresOn"
            type="date"
            defaultValue={artifact?.expiresOn ?? ''}
          />
        )}
      </Field>

      <Field label={tForm('statusModeLabel')} description={tForm('statusModeHint')}>
        {(control) => (
          <>
            <input type="hidden" name="statusMode" value={statusMode} />
            <Select
              value={statusMode}
              onValueChange={(value) => setStatusMode(value as StatusMode)}
            >
              <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_MODE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`statusModes.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field
        label={tForm('notesLabel')}
        optionalLabel={tCommon('labels.optional')}
        error={state.fieldErrors?.notes}
      >
        {(control) => (
          <Textarea {...control} name="notes" rows={3} defaultValue={artifact?.notes ?? ''} />
        )}
      </Field>

      <Button type="submit" loading={pending}>
        {mode === 'create' ? t('create.submit') : t('detail.save')}
      </Button>
    </form>
  );
}

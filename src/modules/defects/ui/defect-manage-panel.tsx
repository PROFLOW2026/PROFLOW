'use client';



import { useActionState, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Textarea } from '@/components/ui/textarea';

import { useTranslations } from 'next-intl';

import type { DefectAction } from '../domain/lifecycle';

import type { DefectPermissions } from '../application/query-defects';

import type { QualityFormData } from '../application/query-defects';

import {

  assignDefectAction,

  cancelDefectAction,

  reopenDefectAction,

  startDefectVerificationAction,

  submitDefectCompletionInternalAction,

  updateDefectAction,

  verifyDefectAction,

} from './actions';

import { AgreementSelect, LocationSelect, PersonSelect, WorkLineSelect } from './form-controls';

import { INITIAL_QUALITY_FORM_STATE } from './form-state';



function ActionBlock({

  title,

  children,

}: {

  readonly title: string;

  readonly children: ReactNode;

}) {

  return (

    <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-subtle)] p-4">

      <h3 className="text-sm font-semibold">{title}</h3>

      {children}

    </section>

  );

}



export function DefectManagePanel({

  projectId,

  defectId,

  allowedActions,

  permissions,

  formData,

  defect,

}: {

  readonly projectId: string;

  readonly defectId: string;

  readonly allowedActions: readonly DefectAction[];

  readonly permissions: DefectPermissions;

  readonly formData: QualityFormData;

  readonly defect: {

    readonly title: string;

    readonly description: string | null;

    readonly severity: string;

    readonly dueDate: string | null;

    readonly locationId: string | null;

    readonly subcontractAgreementId: string | null;

    readonly workLineId: string | null;

    readonly inspectorUserId: string | null;

    readonly contractorVisible: boolean;

  };

}) {

  const t = useTranslations('defects');

  const canManage = permissions.manage;

  const canVerify = permissions.verify;



  const [editState, editAction, editPending] = useActionState(

    updateDefectAction.bind(null, projectId, defectId),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [assignState, assignAction, assignPending] = useActionState(

    assignDefectAction.bind(null, projectId, defectId),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [completionState, completionAction, completionPending] = useActionState(

    submitDefectCompletionInternalAction.bind(null, projectId, defectId),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [verifyStartState, verifyStartAction, verifyStartPending] = useActionState(

    startDefectVerificationAction.bind(null, projectId, defectId),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [verifyState, verifyAction, verifyPending] = useActionState(

    verifyDefectAction.bind(null, projectId, defectId),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [reopenState, reopenAction, reopenPending] = useActionState(

    reopenDefectAction.bind(null, projectId, defectId),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [cancelState, cancelAction, cancelPending] = useActionState(

    cancelDefectAction.bind(null, projectId, defectId),

    INITIAL_QUALITY_FORM_STATE,

  );



  if (!canManage && !canVerify) return null;



  return (

    <div className="flex flex-col gap-4">

      {canManage ? (

        <ActionBlock title={t('edit.title')}>

          <form action={editAction} className="flex flex-col gap-3">

            {editState.error ? <Alert tone="danger">{editState.error}</Alert> : null}

            {editState.success ? <Alert tone="success">{editState.success}</Alert> : null}

            <Input name="title" defaultValue={defect.title} required maxLength={300} />

            <Textarea name="description" defaultValue={defect.description ?? ''} rows={3} maxLength={5000} />

            <Input name="dueDate" type="date" defaultValue={defect.dueDate ?? ''} />

            <LocationSelect

              name="locationId"

              options={formData.locations}

              defaultValue={defect.locationId}

              allowEmpty

              emptyLabel={t('fields.noLocation')}

            />

            <PersonSelect

              name="inspectorUserId"

              people={formData.people}

              defaultValue={defect.inspectorUserId}

              allowEmpty

              emptyLabel={t('fields.noAssignee')}

            />

            <label className="flex items-center gap-2 text-sm">

              <input type="checkbox" name="contractorVisible" defaultChecked={defect.contractorVisible} className="size-4" />

              {t('fields.contractorVisible')}

            </label>

            <Button type="submit" variant="secondary" disabled={editPending}>

              {t('edit.submit')}

            </Button>

          </form>

        </ActionBlock>

      ) : null}



      {canManage && allowedActions.includes('assign') ? (

        <ActionBlock title={t('assign.title')}>

          <form action={assignAction} className="flex flex-col gap-3">

            {assignState.error ? <Alert tone="danger">{assignState.error}</Alert> : null}

            {assignState.success ? <Alert tone="success">{assignState.success}</Alert> : null}

            <AgreementSelect

              name="agreementId"

              options={formData.agreements}

              defaultValue={defect.subcontractAgreementId}

              allowEmpty

              emptyLabel={t('fields.noContractor')}

            />

            <WorkLineSelect

              name="workLineId"

              options={formData.workLines}

              agreementId={defect.subcontractAgreementId}

              defaultValue={defect.workLineId}

              allowEmpty

              emptyLabel={t('fields.noWorkLine')}

            />

            <Input name="dueDate" type="date" defaultValue={defect.dueDate ?? ''} />

            <Textarea name="note" rows={2} maxLength={2000} placeholder={t('fields.note')} />

            <Button type="submit" variant="primary" disabled={assignPending}>

              {t('assign.submit')}

            </Button>

          </form>

        </ActionBlock>

      ) : null}



      {canManage && allowedActions.includes('submit_completion') ? (

        <ActionBlock title={t('completion.title')}>

          <form action={completionAction} className="flex flex-col gap-3">

            {completionState.error ? <Alert tone="danger">{completionState.error}</Alert> : null}

            {completionState.success ? <Alert tone="success">{completionState.success}</Alert> : null}

            <p className="text-sm text-[var(--pf-text-secondary)]">{t('completion.internalHint')}</p>

            <Textarea name="note" rows={2} maxLength={2000} />

            <Button type="submit" variant="primary" disabled={completionPending}>

              {t('completion.submit')}

            </Button>

          </form>

        </ActionBlock>

      ) : null}



      {canVerify && allowedActions.includes('start_verification') ? (

        <ActionBlock title={t('verify.title')}>

          <form action={verifyStartAction} className="flex flex-col gap-3">

            {verifyStartState.error ? <Alert tone="danger">{verifyStartState.error}</Alert> : null}

            {verifyStartState.success ? <Alert tone="success">{verifyStartState.success}</Alert> : null}

            <Button type="submit" variant="secondary" disabled={verifyStartPending}>

              {t('verify.start')}

            </Button>

          </form>

        </ActionBlock>

      ) : null}



      {canVerify && (allowedActions.includes('accept') || allowedActions.includes('reject')) ? (

        <ActionBlock title={t('verify.title')}>

          <form action={verifyAction} className="flex flex-col gap-3">

            {verifyState.error ? <Alert tone="danger">{verifyState.error}</Alert> : null}

            {verifyState.success ? <Alert tone="success">{verifyState.success}</Alert> : null}

            <Textarea name="note" rows={2} maxLength={2000} placeholder={t('fields.rejectReason')} />

            <Input name="dueDate" type="date" />

            <div className="flex flex-wrap gap-2">

              <Button type="submit" name="decision" value="accept" variant="primary" disabled={verifyPending}>

                {t('verify.accept')}

              </Button>

              <Button type="submit" name="decision" value="reject" variant="secondary" disabled={verifyPending}>

                {t('verify.reject')}

              </Button>

            </div>

          </form>

        </ActionBlock>

      ) : null}



      {canManage && allowedActions.includes('reopen') ? (

        <ActionBlock title={t('reopen.title')}>

          <form action={reopenAction} className="flex flex-col gap-3">

            {reopenState.error ? <Alert tone="danger">{reopenState.error}</Alert> : null}

            {reopenState.success ? <Alert tone="success">{reopenState.success}</Alert> : null}

            <Textarea name="note" rows={2} maxLength={2000} placeholder={t('fields.reopenReason')} required />

            <Input name="dueDate" type="date" />

            <Button type="submit" variant="secondary" disabled={reopenPending}>

              {t('reopen.submit')}

            </Button>

          </form>

        </ActionBlock>

      ) : null}



      {canManage && allowedActions.includes('cancel') ? (

        <ActionBlock title={t('cancel.title')}>

          <form action={cancelAction} className="flex flex-col gap-3">

            {cancelState.error ? <Alert tone="danger">{cancelState.error}</Alert> : null}

            {cancelState.success ? <Alert tone="success">{cancelState.success}</Alert> : null}

            <Textarea name="note" rows={2} maxLength={2000} placeholder={t('fields.cancelReason')} required />

            <Button type="submit" variant="secondary" disabled={cancelPending}>

              {t('cancel.submit')}

            </Button>

          </form>

        </ActionBlock>

      ) : null}

    </div>

  );

}



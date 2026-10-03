'use client';



import { useMemo, useState, useActionState } from 'react';

import { Alert } from '@/components/ui/alert';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Textarea } from '@/components/ui/textarea';

import { useTranslations } from 'next-intl';

import { DEFECT_SEVERITIES } from '@/modules/defects/domain/lifecycle';

import { INITIAL_QUALITY_FORM_STATE } from '@/modules/defects/ui/form-state';

import type { CheckResult } from '../domain/rules';

import { CHECK_RESULTS, INSPECTION_OUTCOMES, suggestedOutcome, tallyChecklist } from '../domain/rules';

import type { InspectionDetailView } from '../application/query-inspections';

import {

  cancelInspectionAction,

  recordOutcomeAction,

  reinspectAction,

  saveChecklistAction,

  startInspectionAction,

  updateInspectionAction,

} from './actions';

import { checklistItemLabel } from './tones';



type ItemRow = InspectionDetailView['inspection']['items'][number];



function resultsJson(items: ItemRow[]) {

  return JSON.stringify(

    items.map((item) => ({

      itemId: item.id,

      result: item.result,

      note: item.note,

    })),

  );

}



export function InspectionWorkspace({

  projectId,

  view,

}: {

  readonly projectId: string;

  readonly view: InspectionDetailView;

}) {

  const t = useTranslations('inspections');

  const { inspection, can, permissions } = view;

  const [items, setItems] = useState<ItemRow[]>(() => [...inspection.items]);



  const tally = useMemo(

    () =>

      tallyChecklist(

        items.map((item) => ({

          isRequired: item.isRequired,

          result: item.result,

        })),

      ),

    [items],

  );

  const suggested = suggestedOutcome(tally);



  const [saveState, saveAction, savePending] = useActionState(

    saveChecklistAction.bind(null, projectId, inspection.id),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [outcomeState, outcomeAction, outcomePending] = useActionState(

    recordOutcomeAction.bind(null, projectId, inspection.id),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [startState, startAction, startPending] = useActionState(

    startInspectionAction.bind(null, projectId, inspection.id),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [reinspectState, reinspectFormAction, reinspectPending] = useActionState(

    reinspectAction.bind(null, projectId, inspection.id),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [cancelState, cancelAction, cancelPending] = useActionState(

    cancelInspectionAction.bind(null, projectId, inspection.id),

    INITIAL_QUALITY_FORM_STATE,

  );

  const [editState, editAction, editPending] = useActionState(

    updateInspectionAction.bind(null, projectId, inspection.id),

    INITIAL_QUALITY_FORM_STATE,

  );



  function setResult(itemId: string, result: CheckResult) {

    setItems((prev) => prev.map((row) => (row.id === itemId ? { ...row, result } : row)));

  }



  function setNote(itemId: string, note: string) {

    setItems((prev) => prev.map((row) => (row.id === itemId ? { ...row, note: note || null } : row)));

  }



  const checklistLocked = !can.editChecklist;



  return (

    <div className="flex flex-col gap-6">

      {permissions.manage && can.edit ? (

        <form action={editAction} className="flex max-w-xl flex-col gap-3 rounded-lg border border-[var(--pf-border-subtle)] p-4">

          <h3 className="text-sm font-semibold">{t('edit.title')}</h3>

          {editState.error ? <Alert tone="danger">{editState.error}</Alert> : null}

          {editState.success ? <Alert tone="success">{editState.success}</Alert> : null}

          <Input name="title" defaultValue={inspection.title} required maxLength={300} />

          <Input name="scheduledFor" type="date" defaultValue={inspection.scheduledFor ?? ''} />

          <Button type="submit" variant="secondary" disabled={editPending}>

            {t('edit.submit')}

          </Button>

        </form>

      ) : null}



      {permissions.manage && can.start ? (

        <form action={startAction}>

          {startState.error ? <Alert tone="danger">{startState.error}</Alert> : null}

          {startState.success ? <Alert tone="success">{startState.success}</Alert> : null}

          <Button type="submit" variant="primary" disabled={startPending}>

            {t('actions.start')}

          </Button>

        </form>

      ) : null}



      {items.length > 0 ? (

        <section className="flex flex-col gap-3">

          <h3 className="text-sm font-semibold">{t('checklist.title')}</h3>

          {checklistLocked ? <p className="text-sm text-[var(--pf-text-secondary)]">{t('checklist.locked')}</p> : null}

          <ul className="flex flex-col gap-3">

            {items.map((item) => (

              <li key={item.id} className="rounded-md border border-[var(--pf-border-subtle)] p-3 text-sm">

                <p className="font-medium">

                  {checklistItemLabel(t, inspection.templateKey, item)}

                  <span className="ms-2 text-xs font-normal text-[var(--pf-text-secondary)]">

                    {item.isRequired ? t('checklist.required') : t('checklist.optional')}

                  </span>

                </p>

                <div className="mt-2 flex flex-wrap gap-2">

                  {CHECK_RESULTS.filter((result) => result !== 'pending').map((result) => (

                    <Button

                      key={result}

                      type="button"

                      size="sm"

                      variant={item.result === result ? 'primary' : 'secondary'}

                      disabled={checklistLocked || !permissions.manage}

                      onClick={() => setResult(item.id, result)}

                    >

                      {t(`result.${result}`)}

                    </Button>

                  ))}

                </div>

                {!checklistLocked && permissions.manage ? (

                  <Input

                    className="mt-2"

                    value={item.note ?? ''}

                    onChange={(event) => setNote(item.id, event.target.value)}

                    placeholder={t('checklist.notePlaceholder')}

                    maxLength={1000}

                  />

                ) : item.note ? (

                  <p className="mt-2 text-[var(--pf-text-secondary)]">{item.note}</p>

                ) : null}

              </li>

            ))}

          </ul>

          {permissions.manage && can.editChecklist ? (

            <form action={saveAction} className="flex flex-col gap-2">

              <input type="hidden" name="resultsJson" value={resultsJson(items)} readOnly />

              {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}

              {saveState.success ? <Alert tone="success">{saveState.success}</Alert> : null}

              <Button type="submit" variant="secondary" disabled={savePending}>

                {t('checklist.save')}

              </Button>

            </form>

          ) : null}

        </section>

      ) : (

        <p className="text-sm text-[var(--pf-text-secondary)]">{t('checklist.empty')}</p>

      )}



      {permissions.manage && can.recordOutcome ? (

        <form action={outcomeAction} className="flex max-w-xl flex-col gap-3 rounded-lg border border-[var(--pf-border-subtle)] p-4">

          <h3 className="text-sm font-semibold">{t('outcomeForm.title')}</h3>

          <input type="hidden" name="resultsJson" value={resultsJson(items)} readOnly />

          {outcomeState.error ? <Alert tone="danger">{outcomeState.error}</Alert> : null}

          {outcomeState.success ? <Alert tone="success">{outcomeState.success}</Alert> : null}

          <p className="text-sm text-[var(--pf-text-secondary)]">{t('checklist.suggested', { outcome: t(`outcome.${suggested}`) })}</p>

          <label className="text-sm">

            {t('fields.outcome')}

            <select name="outcome" defaultValue={suggested} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">

              {INSPECTION_OUTCOMES.map((outcome) => (

                <option key={outcome} value={outcome}>

                  {t(`outcome.${outcome}`)}

                </option>

              ))}

            </select>

          </label>

          <Textarea name="summary" rows={3} maxLength={5000} placeholder={t('outcomeForm.summaryHint')} />

          <Textarea name="conditions" rows={2} maxLength={5000} placeholder={t('outcomeForm.conditionsHint')} />

          <fieldset className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-subtle)] p-3">

            <legend className="px-1 text-sm font-medium">{t('outcomeForm.followUpTitle')}</legend>

            <label className="flex items-center gap-2 text-sm">

              <input type="checkbox" name="createDefects" defaultChecked className="size-4" />

              {t('outcomeForm.createDefects')}

            </label>

            <label className="text-sm">

              {t('outcomeForm.defectSeverity')}

              <select name="defectSeverity" defaultValue="medium" className="mt-1 w-full rounded-md border px-3 py-2 text-sm">

                {DEFECT_SEVERITIES.map((severity) => (

                  <option key={severity} value={severity}>

                    {severity}

                  </option>

                ))}

              </select>

            </label>

            <Input name="defectDueDate" type="date" />

            <label className="flex items-center gap-2 text-sm">

              <input type="checkbox" name="createTask" className="size-4" />

              {t('outcomeForm.createTask')}

            </label>

            <Input name="taskTitle" maxLength={300} placeholder={t('outcomeForm.taskTitle')} />

            <Input name="taskDueDate" type="date" />

          </fieldset>

          <Button type="submit" variant="primary" disabled={outcomePending}>

            {t('outcomeForm.submit')}

          </Button>

        </form>

      ) : null}



      {permissions.manage && can.reinspect ? (

        <form action={reinspectFormAction} className="flex max-w-md flex-col gap-2">

          {reinspectState.error ? <Alert tone="danger">{reinspectState.error}</Alert> : null}

          {reinspectState.success ? <Alert tone="success">{reinspectState.success}</Alert> : null}

          <Input name="scheduledFor" type="date" />

          <Button type="submit" variant="secondary" disabled={reinspectPending}>

            {t('actions.reinspect')}

          </Button>

        </form>

      ) : null}



      {permissions.manage && can.cancel ? (

        <form action={cancelAction}>

          {cancelState.error ? <Alert tone="danger">{cancelState.error}</Alert> : null}

          {cancelState.success ? <Alert tone="success">{cancelState.success}</Alert> : null}

          <Button type="submit" variant="secondary" disabled={cancelPending}>

            {t('actions.cancel')}

          </Button>

        </form>

      ) : null}

    </div>

  );

}



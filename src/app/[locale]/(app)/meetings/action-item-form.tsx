'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { MeetingActionItem } from '@/modules/meetings';

const ACTION_ITEM_STATUSES = ['open', 'done', 'cancelled'] as const;
import {
  createActionItemAction,
  updateActionItemAction,
  type MeetingFormState,
} from './actions';

const NONE = '__none__';

type AssigneeType = 'none' | 'member' | 'employee';

function initialAssigneeType(item?: MeetingActionItem): AssigneeType {
  if (item?.assignedToOrgMemberId) return 'member';
  if (item?.assignedToEmployeeId) return 'employee';
  return 'none';
}

export function ActionItemForm({
  mode,
  meetingId,
  actionItem,
  decisions,
  members,
  employees,
}: {
  mode: 'create' | 'edit';
  meetingId: string;
  actionItem?: MeetingActionItem;
  decisions: readonly { id: string; title: string }[];
  members: readonly { id: string; name: string }[];
  employees: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('tasks');
  const tCommon = useTranslations('common');
  const action = mode === 'create' ? createActionItemAction : updateActionItemAction;
  const [state, formAction, pending] = useActionState<MeetingFormState, FormData>(action, {});
  const [decisionId, setDecisionId] = useState(actionItem?.decisionId ?? NONE);
  const [assigneeType, setAssigneeType] = useState<AssigneeType>(initialAssigneeType(actionItem));
  const [assignedToOrgMemberId, setAssignedToOrgMemberId] = useState(
    actionItem?.assignedToOrgMemberId ?? NONE,
  );
  const [assignedToEmployeeId, setAssignedToEmployeeId] = useState(
    actionItem?.assignedToEmployeeId ?? NONE,
  );
  const [status, setStatus] = useState(actionItem?.status ?? 'open');

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      {actionItem ? <input type="hidden" name="actionItemId" value={actionItem.id} /> : null}
      <input type="hidden" name="assigneeType" value={assigneeType} />
      {mode === 'edit' ? <input type="hidden" name="status" value={status} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('meetings.fields.title')} required error={state.fieldErrors?.title}>
        {(control) => (
          <Input
            {...control}
            name="title"
            required
            defaultValue={actionItem?.title ?? ''}
            className="h-11 text-base"
          />
        )}
      </Field>

      {decisions.length > 0 ? (
        <Field label={t('meetings.form.relatedDecision')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <>
              <input type="hidden" name="decisionId" value={decisionId === NONE ? '' : decisionId} />
              <select
                {...control}
                value={decisionId}
                onChange={(event) => setDecisionId(event.target.value)}
                className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              >
                <option value={NONE}>{t('meetings.form.noDecision')}</option>
                {decisions.map((decision) => (
                  <option key={decision.id} value={decision.id}>
                    {decision.title}
                  </option>
                ))}
              </select>
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('meetings.form.assigneeType')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <select
            {...control}
            value={assigneeType}
            onChange={(event) => setAssigneeType(event.target.value as AssigneeType)}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="none">{t('meetings.form.assigneeNone')}</option>
            <option value="member">{t('meetings.form.assigneeMember')}</option>
            <option value="employee">{t('meetings.form.assigneeEmployee')}</option>
          </select>
        )}
      </Field>

      {assigneeType === 'member' ? (
        <Field label={t('meetings.form.assignee')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="assignedToOrgMemberId"
                value={assignedToOrgMemberId === NONE ? '' : assignedToOrgMemberId}
              />
              <select
                {...control}
                value={assignedToOrgMemberId}
                onChange={(event) => setAssignedToOrgMemberId(event.target.value)}
                className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              >
                <option value={NONE} disabled>
                  —
                </option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </Field>
      ) : null}

      {assigneeType === 'employee' ? (
        <Field label={t('meetings.form.assignee')}>
          {(control) => (
            <>
              <input
                type="hidden"
                name="assignedToEmployeeId"
                value={assignedToEmployeeId === NONE ? '' : assignedToEmployeeId}
              />
              <select
                {...control}
                value={assignedToEmployeeId}
                onChange={(event) => setAssignedToEmployeeId(event.target.value)}
                className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              >
                <option value={NONE} disabled>
                  —
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('meetings.form.dueDate')} optionalLabel={tCommon('labels.optional')}>
        {(control) => (
          <Input
            {...control}
            name="dueDate"
            type="date"
            defaultValue={actionItem?.dueDate ?? ''}
            className="h-11 text-base"
          />
        )}
      </Field>

      {mode === 'edit' ? (
        <Field label={t('meetings.form.status')}>
          {(control) => (
            <select
              {...control}
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
            >
              {ACTION_ITEM_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`meetings.actionItem.status.${value}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      <Button type="submit" loading={pending} block>
        {mode === 'create' ? t('meetings.actionItem.add') : tCommon('actions.save')}
      </Button>
    </form>
  );
}

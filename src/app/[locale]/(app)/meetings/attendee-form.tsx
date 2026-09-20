'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { addAttendeeAction, type MeetingFormState } from './actions';

const NONE = '__none__';

type AttendeeType = 'member' | 'employee' | 'contact' | 'external';

export function AttendeeForm({
  meetingId,
  members,
  employees,
  contacts,
}: {
  meetingId: string;
  members: readonly { id: string; name: string }[];
  employees: readonly { id: string; name: string }[];
  contacts: readonly { id: string; name: string; clientName?: string | null }[];
}) {
  const t = useTranslations('tasks');
  const [state, formAction, pending] = useActionState<MeetingFormState, FormData>(
    addAttendeeAction,
    {},
  );
  const [attendeeType, setAttendeeType] = useState<AttendeeType>('member');
  const [orgMemberId, setOrgMemberId] = useState(NONE);
  const [employeeId, setEmployeeId] = useState(NONE);
  const [contactId, setContactId] = useState(NONE);

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="attendeeType" value={attendeeType} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('meetings.form.attendeeType')} required>
        {(control) => (
          <select
            {...control}
            value={attendeeType}
            onChange={(event) => setAttendeeType(event.target.value as AttendeeType)}
            className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
          >
            <option value="member">{t('meetings.form.attendeeMember')}</option>
            <option value="employee">{t('meetings.form.attendeeEmployee')}</option>
            {contacts.length > 0 ? (
              <option value="contact">{t('meetings.form.attendeeContact')}</option>
            ) : null}
            <option value="external">{t('meetings.form.attendeeExternal')}</option>
          </select>
        )}
      </Field>

      {attendeeType === 'member' ? (
        <Field label={t('meetings.form.attendeeMember')} required error={state.fieldErrors?.attendee}>
          {(control) => (
            <>
              <input type="hidden" name="orgMemberId" value={orgMemberId === NONE ? '' : orgMemberId} />
              <select
                {...control}
                value={orgMemberId}
                onChange={(event) => setOrgMemberId(event.target.value)}
                required
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

      {attendeeType === 'employee' ? (
        <Field label={t('meetings.form.attendeeEmployee')} required error={state.fieldErrors?.attendee}>
          {(control) => (
            <>
              <input type="hidden" name="employeeId" value={employeeId === NONE ? '' : employeeId} />
              <select
                {...control}
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                required
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

      {attendeeType === 'contact' ? (
        <Field label={t('meetings.form.attendeeContact')} required error={state.fieldErrors?.attendee}>
          {(control) => (
            <>
              <input type="hidden" name="contactId" value={contactId === NONE ? '' : contactId} />
              <select
                {...control}
                value={contactId}
                onChange={(event) => setContactId(event.target.value)}
                required
                className="flex h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              >
                <option value={NONE} disabled>
                  —
                </option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.clientName ? `${contact.name} (${contact.clientName})` : contact.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </Field>
      ) : null}

      {attendeeType === 'external' ? (
        <Field label={t('meetings.form.displayName')} required error={state.fieldErrors?.attendee}>
          {(control) => (
            <Input
              {...control}
              name="displayName"
              required
              placeholder={t('meetings.form.displayNamePlaceholder')}
              className="h-11 text-base"
            />
          )}
        </Field>
      ) : null}

      <Button type="submit" loading={pending} block>
        {t('meetings.form.submitAddAttendee')}
      </Button>
    </form>
  );
}

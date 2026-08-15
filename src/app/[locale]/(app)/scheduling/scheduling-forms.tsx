'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, inputClassName } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UNAVAILABILITY_KINDS } from '@/modules/scheduling/domain/types';
import {
  createBookingAction,
  createUnavailabilityAction,
  updateBookingAction,
  type SchedulingFormState,
} from './actions';

export interface SchedulingOption {
  id: string;
  name: string;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function OverlapConfirm({
  required,
  id,
}: {
  required?: boolean;
  id: string;
}) {
  const t = useTranslations('scheduling');
  if (!required) return null;
  return (
    <label className="flex items-start gap-2 text-sm" htmlFor={id}>
      <input id={id} type="checkbox" name="confirmConflict" className="mt-1 size-4" />
      <span>{t('confirmOverlap')}</span>
    </label>
  );
}

export function CreateBookingForm({
  employees,
  projects,
}: {
  employees: SchedulingOption[];
  projects: SchedulingOption[];
}) {
  const t = useTranslations('scheduling');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SchedulingFormState, FormData>(
    createBookingAction,
    {},
  );

  if (employees.length === 0) return null;

  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
        {open ? tCommon('actions.close') : t('newBooking')}
      </Button>
      {open ? (
        <form action={formAction} className="mt-3 flex max-w-lg flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          {state.error ? <Alert tone={state.confirmRequired ? 'warning' : 'danger'}>{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{t('saved')}</Alert> : null}

          <Field label={t('fields.employee')} required error={state.fieldErrors?.employeeId}>
            {(control) => (
              <select {...control} name="employeeId" required className={inputClassName} defaultValue="">
                <option value="" disabled>
                  {t('fields.employeePlaceholder')}
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {projects.length > 0 ? (
            <Field
              label={t('fields.project')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.projectId}
            >
              {(control) => (
                <select {...control} name="projectId" className={inputClassName} defaultValue="">
                  <option value="">{t('fields.projectNone')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}

          <Field label={t('fields.startAt')} required error={state.fieldErrors?.startAt}>
            {(control) => (
              <Input {...control} name="startAt" type="datetime-local" dir="ltr" required className="h-11" />
            )}
          </Field>
          <Field label={t('fields.endAt')} required error={state.fieldErrors?.endAt}>
            {(control) => (
              <Input {...control} name="endAt" type="datetime-local" dir="ltr" required className="h-11" />
            )}
          </Field>
          <Field
            label={t('fields.plannedHours')}
            optionalLabel={tCommon('labels.optional')}
            description={t('fields.plannedHoursHint')}
            error={state.fieldErrors?.plannedHours}
          >
            {(control) => (
              <Input {...control} name="plannedHours" type="number" min={0} step="0.25" dir="ltr" className="h-11" />
            )}
          </Field>
          <Field label={t('fields.notes')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Textarea {...control} name="notes" rows={2} />}
          </Field>
          <OverlapConfirm required={state.confirmRequired} id="create-booking-confirm" />
          <Button type="submit" loading={pending}>
            {t('actions.createBooking')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function CreateUnavailabilityForm({ employees }: { employees: SchedulingOption[] }) {
  const t = useTranslations('scheduling');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SchedulingFormState, FormData>(
    createUnavailabilityAction,
    {},
  );

  if (employees.length === 0) return null;

  return (
    <div>
      <Button type="button" variant="secondary" onClick={() => setOpen((value) => !value)}>
        {open ? tCommon('actions.close') : t('newUnavailability')}
      </Button>
      {open ? (
        <form action={formAction} className="mt-3 flex max-w-lg flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{t('saved')}</Alert> : null}

          <Field label={t('fields.employee')} required error={state.fieldErrors?.employeeId}>
            {(control) => (
              <select {...control} name="employeeId" required className={inputClassName} defaultValue="">
                <option value="" disabled>
                  {t('fields.employeePlaceholder')}
                </option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('fields.kind')}>
            {(control) => (
              <select {...control} name="kind" className={inputClassName} defaultValue="leave">
                {UNAVAILABILITY_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`kinds.${kind}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={t('fields.startDate')} required error={state.fieldErrors?.startDate}>
            {(control) => <Input {...control} name="startDate" type="date" required className="h-11" />}
          </Field>
          <Field label={t('fields.endDate')} required error={state.fieldErrors?.endDate}>
            {(control) => <Input {...control} name="endDate" type="date" required className="h-11" />}
          </Field>
          <Field label={t('fields.notes')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Textarea {...control} name="notes" rows={2} />}
          </Field>
          <Button type="submit" loading={pending}>
            {t('actions.createUnavailability')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function RescheduleBookingForm({
  bookingId,
  employeeId,
  startAt,
  endAt,
  plannedHours,
}: {
  bookingId: string;
  employeeId: string;
  startAt: string;
  endAt: string;
  plannedHours: number;
}) {
  const t = useTranslations('scheduling');
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<SchedulingFormState, FormData>(
    updateBookingAction,
    {},
  );

  return (
    <div className="mt-2">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
        {open ? t('hideReschedule') : t('reschedule')}
      </Button>
      {open ? (
        <form action={formAction} className="mt-2 flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="bookingId" value={bookingId} />
          <input type="hidden" name="employeeId" value={employeeId} />
          {state.error ? <Alert tone={state.confirmRequired ? 'warning' : 'danger'}>{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{t('saved')}</Alert> : null}
          <Field label={t('fields.startAt')}>
            {(control) => (
              <Input
                {...control}
                name="startAt"
                type="datetime-local"
                dir="ltr"
                defaultValue={toDatetimeLocal(startAt)}
              />
            )}
          </Field>
          <Field label={t('fields.endAt')}>
            {(control) => (
              <Input
                {...control}
                name="endAt"
                type="datetime-local"
                dir="ltr"
                defaultValue={toDatetimeLocal(endAt)}
              />
            )}
          </Field>
          <Field label={t('fields.plannedHours')} optionalLabel="">
            {(control) => (
              <Input
                {...control}
                name="plannedHours"
                type="number"
                min={0}
                step="0.25"
                dir="ltr"
                defaultValue={Number.isFinite(plannedHours) ? String(plannedHours) : ''}
              />
            )}
          </Field>
          <OverlapConfirm required={state.confirmRequired} id={`reschedule-confirm-${bookingId}`} />
          <Button type="submit" size="sm" loading={pending}>
            {t('actions.saveReschedule')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

'use client';

/**
 * Employee self-service attendance correction request form (0137).
 *
 * Allows employees to request a correction for a past attendance day.
 * The request is reviewed by a manager (see AttendanceCorrectionRequestsPanel).
 */

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface AttendanceCorrectionRequestActionState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
  readonly requestId?: string;
}

export interface AttendanceCorrectionRequestFormProps {
  /**
   * Server action that submits the correction request.
   * Should accept FormData with: workDate, requestedClockIn, requestedClockOut, reason.
   */
  readonly submitAction: (
    prevState: AttendanceCorrectionRequestActionState,
    formData: FormData,
  ) => Promise<AttendanceCorrectionRequestActionState>;
  readonly initialWorkDate?: string;
}

export function AttendanceCorrectionRequestForm({
  submitAction,
  initialWorkDate = '',
}: AttendanceCorrectionRequestFormProps) {
  const t = useTranslations('workforce.attendanceCorrection');
  const [state, formAction, pending] = useActionState(submitAction, {});
  const [workDate, setWorkDate] = useState(initialWorkDate);

  if (state.success) {
    return (
      <div className="rounded-lg border border-[var(--pf-border-success)] bg-[var(--pf-bg-success)] p-4 text-sm text-[var(--pf-text-success)]">
        {t('submitted')}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && (
        <Alert tone="danger">{state.error}</Alert>
      )}

      {/* Date selection */}
      <Field
        label={t('workDate')}
        error={state.fieldErrors?.workDate}
        required
      >
        {(control) => (
          <Input
            {...control}
            type="date"
            name="workDate"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            required
          />
        )}
      </Field>

      {/* Requested times */}
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t('requestedClockIn')}
          error={state.fieldErrors?.requestedClockIn}
          required
        >
          {(control) => (
            <Input
              {...control}
              type="time"
              name="requestedClockIn"
              required
            />
          )}
        </Field>
        <Field
          label={t('requestedClockOut')}
          error={state.fieldErrors?.requestedClockOut}
          required
        >
          {(control) => (
            <Input
              {...control}
              type="time"
              name="requestedClockOut"
              required
            />
          )}
        </Field>
      </div>

      {/* Reason */}
      <Field
        label={t('reason')}
        error={state.fieldErrors?.reason}
        required
      >
        {(control) => (
          <Textarea
            {...control}
            name="reason"
            placeholder={t('reasonPlaceholder')}
            rows={3}
            maxLength={2000}
            required
          />
        )}
      </Field>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}

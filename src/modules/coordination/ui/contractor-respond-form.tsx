'use client';

import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { NOTE_REQUIRED_STATUSES, RESPONSE_STATUSES } from '../domain/constants';
import type { CoordinationResponseStatus } from '../domain/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/shared/ui/cn';
import { respondToCoordinationEventAction } from '../actions/external-actions';
import { FormError, FormRow } from './form-controls';
import type { PortalRespondView } from './types';

const NOTE_REQUIRED: readonly CoordinationResponseStatus[] = NOTE_REQUIRED_STATUSES;

/** Mobile-first readiness answer for one invitation of the signed-in contractor. */
export function ContractorRespondForm({ view }: { view: PortalRespondView }) {
  const t = useTranslations('coordination');
  const id = useId();
  const [status, setStatus] = useState<CoordinationResponseStatus | null>(null);
  const [note, setNote] = useState('');
  const [acked, setAcked] = useState<string[]>(view.acknowledgements.filter((item) => item.done).map((item) => item.key));
  const [raiseIssue, setRaiseIssue] = useState(false);
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDescription, setIssueDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!status) return;
        setError(null);
        setFieldErrors({});
        setSent(false);
        startTransition(async () => {
          const result = await respondToCoordinationEventAction({
            projectId: view.projectId,
            eventId: view.eventId,
            participantId: view.participantId,
            status,
            note: note || null,
            acknowledgedKeys: acked,
            raiseIssue: raiseIssue ? { title: issueTitle, description: issueDescription || null } : null,
          });
          if (result.ok) {
            setSent(true);
            setStatus(null);
            setNote('');
            setRaiseIssue(false);
            setIssueTitle('');
            setIssueDescription('');
          } else {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
          }
        });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{t('portal.respondTitle')}</legend>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('portal.respondDescription')}</p>
        <div className="grid gap-2">
          {RESPONSE_STATUSES.map((value) => (
            <label
              key={value}
              className={cn(
                'flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3',
                status === value
                  ? 'border-[var(--pf-border-focus)] bg-[var(--pf-bg-subtle)]'
                  : 'border-[var(--pf-border-default)]',
              )}
            >
              <input
                type="radio"
                name={`${id}-status`}
                className="mt-1 size-5"
                checked={status === value}
                onChange={() => setStatus(value)}
              />
              <span className="flex flex-col">
                <span className="font-medium">{t(`partyStatus.${value}`)}</span>
                <span className="text-xs text-[var(--pf-text-secondary)]">{t(`portal.statusHints.${value}`)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <FormRow label={t('fields.note')} htmlFor={`${id}-note`} error={fieldErrors.note}>
        <Textarea
          id={`${id}-note`}
          value={note}
          placeholder={t('portal.notePlaceholder')}
          required={status !== null && NOTE_REQUIRED.includes(status)}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormRow>

      {view.acknowledgements.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold">{t('portal.acknowledgeTitle')}</legend>
          {view.acknowledgements.map((item) => (
            <label key={item.key} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={acked.includes(item.key)}
                disabled={item.done}
                onChange={() =>
                  setAcked((current) =>
                    current.includes(item.key) ? current.filter((key) => key !== item.key) : [...current, item.key],
                  )
                }
              />
              <span className="flex-1">{item.label}</span>
              {item.done ? (
                <span className="inline-flex items-center gap-1 text-xs text-[var(--pf-status-success-fg)]">
                  <CheckCircle2 className="size-4" aria-hidden />
                  {t('portal.acknowledged')}
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>
      ) : null}

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5" checked={raiseIssue} onChange={(e) => setRaiseIssue(e.target.checked)} />
        {t('portal.raiseIssue')}
      </label>
      {raiseIssue ? (
        <div className="flex flex-col gap-3">
          <FormRow label={t('portal.issueTitle')} htmlFor={`${id}-it`} error={fieldErrors['raiseIssue.title']}>
            <Input id={`${id}-it`} value={issueTitle} maxLength={200} onChange={(e) => setIssueTitle(e.target.value)} required />
          </FormRow>
          <FormRow label={t('portal.issueDescription')} htmlFor={`${id}-id`}>
            <Textarea id={`${id}-id`} value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} />
          </FormRow>
        </div>
      ) : null}

      <FormError message={error} />
      {sent ? (
        <p role="status" className="text-sm text-[var(--pf-status-success-fg)]">
          {t('portal.submitted')}
        </p>
      ) : null}
      <Button type="submit" size="lg" block loading={pending} disabled={!status}>
        {t('portal.submit')}
      </Button>
    </form>
  );
}

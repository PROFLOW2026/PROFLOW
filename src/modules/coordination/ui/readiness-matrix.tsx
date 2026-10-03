'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { RESPONSE_STATUSES, TASK_PRIORITIES } from '../domain/constants';
import type { CoordinationResponseStatus } from '../domain/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createCoordinationFollowUpTaskAction,
  recordResponseOnBehalfAction,
  requestCoordinationReadinessAction,
  updateCoordinationParticipantAction,
} from '../actions/internal-actions';
import { FormError, FormRow, selectClassName } from './form-controls';
import { partyTone } from './tones';
import type { MatrixRowView } from './types';

type Panel = { participantId: string; kind: 'answer' | 'task' } | null;

/** Readiness matrix (table on desktop, cards on mobile) with per-party actions for managers. */
export function ReadinessMatrix({
  projectId,
  eventId,
  rows,
  acknowledgements,
  canManage,
  acceptsResponses,
  evidenceSlots = {},
}: {
  projectId: string;
  eventId: string;
  rows: readonly MatrixRowView[];
  acknowledgements: readonly { key: string; label: string }[];
  canManage: boolean;
  acceptsResponses: boolean;
  /** Server-rendered evidence of each party's latest answer, keyed by participant id. */
  evidenceSlots?: Readonly<Record<string, ReactNode>>;
}) {
  const t = useTranslations('coordination');
  const [panel, setPanel] = useState<Panel>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const actionable = canManage && acceptsResponses;

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? null);
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noContractors')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {actionable ? (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={pending && panel === null}
            onClick={() => runAction(() => requestCoordinationReadinessAction({ projectId, eventId }))}
          >
            {t('actions.remindAll')}
          </Button>
        </div>
      ) : null}
      <FormError message={error} />
      <ul className="divide-y divide-[var(--pf-border-default)] rounded-xl border border-[var(--pf-border-default)]">
        {rows.map((row) => (
          <li key={row.participantId} className="flex flex-col gap-3 p-3 md:p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[var(--pf-text-primary)]">{row.tradeLabel ?? row.partyName}</span>
                  <Badge tone={partyTone(row.state)}>{t(`partyStatus.${row.state}`)}</Badge>
                  <Badge tone="neutral">{row.isRequired ? t('fields.required') : t('fields.optional')}</Badge>
                  {row.openIssueCount > 0 ? (
                    <Badge tone="warning">{t('detail.openIssues', { count: row.openIssueCount })}</Badge>
                  ) : null}
                </div>
                <span className="text-sm text-[var(--pf-text-secondary)]">
                  {row.tradeLabel ? row.partyName : null}
                  {row.agreementTitle ? `${row.tradeLabel ? ' · ' : ''}${row.agreementTitle}` : null}
                </span>
                {row.lastNote ? <p className="text-sm text-[var(--pf-text-primary)]">{row.lastNote}</p> : null}
                <span className="text-xs text-[var(--pf-text-muted)]">
                  {row.lastAnsweredAt
                    ? `${t('detail.answeredAt', { date: row.lastAnsweredAt })} · ${
                        row.lastAnsweredBy?.type === 'external'
                          ? t('detail.byContractor')
                          : t('detail.bySiteTeam', { name: row.lastAnsweredBy?.name ?? '' })
                      }`
                    : row.requestedAt
                      ? t('detail.requestedAt', { date: row.requestedAt })
                      : null}
                </span>
              </div>
              {row.acknowledgementsTotal > 0 ? (
                <div className="flex shrink-0 flex-col gap-1 text-sm md:items-end">
                  <span className="text-[var(--pf-text-secondary)]">
                    {t('detail.acknowledgements')}:{' '}
                    {t('detail.acksProgress', { done: row.acknowledgementsDone, total: row.acknowledgementsTotal })}
                  </span>
                  {row.missingAcknowledgementLabels.length > 0 ? (
                    <span className="text-xs text-[var(--pf-text-muted)]">
                      {t('detail.missingAcks', { items: row.missingAcknowledgementLabels.join(', ') })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {evidenceSlots[row.participantId] ?? null}

            {actionable ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPanel({ participantId: row.participantId, kind: 'answer' })}
                >
                  {t('actions.recordAnswer')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPanel({ participantId: row.participantId, kind: 'task' })}
                >
                  {t('actions.createTask')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    runAction(() =>
                      requestCoordinationReadinessAction({ projectId, eventId, participantIds: [row.participantId] }),
                    )
                  }
                >
                  {t('actions.remind')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    runAction(() =>
                      updateCoordinationParticipantAction({
                        projectId,
                        eventId,
                        participantId: row.participantId,
                        isRequired: !row.isRequired,
                      }),
                    )
                  }
                >
                  {row.isRequired ? t('actions.makeOptional') : t('actions.makeRequired')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="dangerGhost"
                  onClick={() =>
                    runAction(() =>
                      updateCoordinationParticipantAction({ projectId, eventId, participantId: row.participantId, remove: true }),
                    )
                  }
                >
                  {t('actions.remove')}
                </Button>
              </div>
            ) : null}

            {panel?.participantId === row.participantId && panel.kind === 'answer' ? (
              <AnswerOnBehalfForm
                projectId={projectId}
                eventId={eventId}
                participantId={row.participantId}
                acknowledgements={acknowledgements}
                onDone={() => setPanel(null)}
              />
            ) : null}
            {panel?.participantId === row.participantId && panel.kind === 'task' ? (
              <FollowUpTaskForm
                projectId={projectId}
                eventId={eventId}
                participantId={row.participantId}
                issueId={null}
                defaultTitle={row.lastNote ?? ''}
                onDone={() => setPanel(null)}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnswerOnBehalfForm({
  projectId,
  eventId,
  participantId,
  acknowledgements,
  onDone,
}: {
  projectId: string;
  eventId: string;
  participantId: string;
  acknowledgements: readonly { key: string; label: string }[];
  onDone: () => void;
}) {
  const t = useTranslations('coordination');
  const id = useId();
  const [status, setStatus] = useState<CoordinationResponseStatus>('ready');
  const [note, setNote] = useState('');
  const [acked, setAcked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-lg bg-[var(--pf-bg-subtle)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await recordResponseOnBehalfAction({
            projectId,
            eventId,
            participantId,
            status,
            note: note || null,
            acknowledgedKeys: acked,
          });
          if (result.ok) onDone();
          else {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
          }
        });
      }}
    >
      <p className="text-sm font-medium">{t('answer.title')}</p>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('answer.description')}</p>
      <FormRow label={t('fields.status')} htmlFor={`${id}-s`}>
        <select
          id={`${id}-s`}
          className={selectClassName}
          value={status}
          onChange={(e) => setStatus(e.target.value as CoordinationResponseStatus)}
        >
          {RESPONSE_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`partyStatus.${value}`)}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label={t('fields.note')} htmlFor={`${id}-n`} error={fieldErrors.note}>
        <Textarea id={`${id}-n`} value={note} onChange={(e) => setNote(e.target.value)} />
      </FormRow>
      {acknowledgements.map((item) => (
        <label key={item.key} className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={acked.includes(item.key)}
            onChange={() =>
              setAcked((current) => (current.includes(item.key) ? current.filter((k) => k !== item.key) : [...current, item.key]))
            }
          />
          {item.label}
        </label>
      ))}
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {t('actions.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function FollowUpTaskForm({
  projectId,
  eventId,
  participantId,
  issueId,
  defaultTitle,
  onDone,
}: {
  projectId: string;
  eventId: string;
  participantId: string;
  issueId: string | null;
  defaultTitle: string;
  onDone: () => void;
}) {
  const t = useTranslations('coordination');
  const id = useId();
  const [title, setTitle] = useState(defaultTitle.slice(0, 200));
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 rounded-lg bg-[var(--pf-bg-subtle)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await createCoordinationFollowUpTaskAction({
            projectId,
            eventId,
            participantId,
            issueId,
            title,
            description: description || null,
            dueDate: dueDate || null,
            priority,
          });
          if (result.ok) onDone();
          else {
            setError(result.error);
            setFieldErrors(result.fieldErrors ?? {});
          }
        });
      }}
    >
      <p className="text-sm font-medium">{t('task.title')}</p>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('task.description')}</p>
      <FormRow label={t('fields.title')} htmlFor={`${id}-t`} error={fieldErrors.title}>
        <Input id={`${id}-t`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </FormRow>
      <FormRow label={t('fields.description')} htmlFor={`${id}-d`}>
        <Textarea id={`${id}-d`} value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormRow>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormRow label={t('fields.dueDate')} htmlFor={`${id}-due`} error={fieldErrors.dueDate}>
          <Input id={`${id}-due`} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormRow>
        <FormRow label={t('fields.priority')} htmlFor={`${id}-p`}>
          <select
            id={`${id}-p`}
            className={selectClassName}
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {t(`priorities.${value}`)}
              </option>
            ))}
          </select>
        </FormRow>
      </div>
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {t('actions.createTask')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}

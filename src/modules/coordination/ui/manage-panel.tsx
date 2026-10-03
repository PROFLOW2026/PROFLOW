'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, useTransition, type ReactNode } from 'react';
import { EVENT_KINDS } from '../domain/constants';
import type { CoordinationEventKind, CoordinationOutcome, CoordinationOverrideDecision } from '../domain/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  inviteCoordinationParticipantsAction,
  linkCoordinationDocumentAction,
  overrideCoordinationReadinessAction,
  recordCoordinationOutcomeAction,
  rescheduleCoordinationEventAction,
  updateCoordinationEventAction,
} from '../actions/internal-actions';
import { FormError, FormRow, selectClassName } from './form-controls';
import type { CoordinationFormOptionsView, ManagePanelView } from './types';

type PanelKey = 'edit' | 'invite' | 'override' | 'reschedule' | 'outcome' | 'document';

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

function useSubmit() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  function submit(fn: () => Promise<Result>, onSuccess: () => void) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await fn();
      if (result.ok) onSuccess();
      else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }
  return { pending, error, fieldErrors, submit };
}

/** Manager actions for one event: edit, invite, override readiness, reschedule, outcome, link documents. */
export function CoordinationManagePanel({
  view,
  options,
}: {
  view: ManagePanelView;
  options: CoordinationFormOptionsView;
}) {
  const t = useTranslations('coordination');
  const [open, setOpen] = useState<PanelKey | null>(null);
  const close = () => setOpen(null);

  const buttons: { key: PanelKey; label: string; show: boolean }[] = [
    { key: 'edit', label: t('actions.edit'), show: view.canEdit },
    { key: 'invite', label: t('actions.invite'), show: view.canEdit },
    { key: 'override', label: t('actions.override'), show: view.acceptsResponses },
    { key: 'reschedule', label: t('actions.reschedule'), show: view.canReschedule },
    { key: 'outcome', label: t('actions.recordOutcome'), show: view.allowedOutcomes.length > 0 },
    { key: 'document', label: t('actions.linkDocument'), show: true },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {buttons
          .filter((button) => button.show)
          .map((button) => (
            <Button
              key={button.key}
              type="button"
              size="sm"
              variant={open === button.key ? 'primary' : 'secondary'}
              aria-expanded={open === button.key}
              onClick={() => setOpen(open === button.key ? null : button.key)}
            >
              {button.label}
            </Button>
          ))}
      </div>
      {open === 'edit' ? <EditForm view={view} options={options} onDone={close} /> : null}
      {open === 'invite' ? <InviteForm view={view} options={options} onDone={close} /> : null}
      {open === 'override' ? <OverrideForm view={view} onDone={close} /> : null}
      {open === 'reschedule' ? <RescheduleForm view={view} onDone={close} /> : null}
      {open === 'outcome' ? <OutcomeForm view={view} onDone={close} /> : null}
      {open === 'document' ? <DocumentForm view={view} options={options} onDone={close} /> : null}
    </div>
  );
}

function PanelShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-4">
      <div>
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-[var(--pf-text-secondary)]">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Actions({ pending, onCancel, label }: { pending: boolean; onCancel: () => void; label: string }) {
  const t = useTranslations('coordination');
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {t('actions.cancel')}
      </Button>
      <Button type="submit" size="sm" loading={pending}>
        {label}
      </Button>
    </div>
  );
}

function EditForm({ view, options, onDone }: { view: ManagePanelView; options: CoordinationFormOptionsView; onDone: () => void }) {
  const t = useTranslations('coordination');
  const id = useId();
  const { pending, error, fieldErrors, submit } = useSubmit();
  const [title, setTitle] = useState(view.title);
  const [kind, setKind] = useState<CoordinationEventKind>(view.kind);
  const [description, setDescription] = useState(view.description ?? '');
  const [locationId, setLocationId] = useState(view.locationId ?? '');
  const [locationNote, setLocationNote] = useState(view.locationNote ?? '');
  const [workPackageId, setWorkPackageId] = useState(view.workPackageId ?? '');
  const [phaseId, setPhaseId] = useState(view.phaseId ?? '');
  const [preparationDeadline, setPreparationDeadline] = useState(view.preparationDeadlineLocal);
  const [addAcknowledgements, setAddAcknowledgements] = useState('');
  const phases = options.structure.phases.filter((phase) => !workPackageId || phase.workPackageId === workPackageId);

  return (
    <PanelShell title={t('actions.edit')}>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(
            () =>
              updateCoordinationEventAction({
                projectId: view.projectId,
                eventId: view.eventId,
                title,
                kind,
                description: description || null,
                locationId: locationId || null,
                locationNote: locationNote || null,
                workPackageId: workPackageId || null,
                phaseId: phaseId || null,
                preparationDeadline: preparationDeadline || null,
                addAcknowledgements: addAcknowledgements.split('\n'),
              }),
            onDone,
          );
        }}
      >
        <FormRow label={t('fields.title')} htmlFor={`${id}-t`} error={fieldErrors.title} className="md:col-span-2">
          <Input id={`${id}-t`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </FormRow>
        <FormRow label={t('fields.kind')} htmlFor={`${id}-k`}>
          <select id={`${id}-k`} className={selectClassName} value={kind} onChange={(e) => setKind(e.target.value as CoordinationEventKind)}>
            {EVENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kinds.${value}`)}
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label={t('fields.preparationDeadline')} htmlFor={`${id}-p`} error={fieldErrors.preparationDeadline}>
          <Input id={`${id}-p`} type="datetime-local" value={preparationDeadline} onChange={(e) => setPreparationDeadline(e.target.value)} />
        </FormRow>
        <FormRow label={t('fields.location')} htmlFor={`${id}-l`} error={fieldErrors.locationId}>
          <select id={`${id}-l`} className={selectClassName} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">{t('fields.none')}</option>
            {options.structure.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label={t('fields.locationNote')} htmlFor={`${id}-ln`}>
          <Input id={`${id}-ln`} value={locationNote} onChange={(e) => setLocationNote(e.target.value)} maxLength={200} />
        </FormRow>
        <FormRow label={t('fields.workPackage')} htmlFor={`${id}-w`}>
          <select
            id={`${id}-w`}
            className={selectClassName}
            value={workPackageId}
            onChange={(e) => {
              setWorkPackageId(e.target.value);
              setPhaseId('');
            }}
          >
            <option value="">{t('fields.none')}</option>
            {options.structure.workPackages.map((wp) => (
              <option key={wp.id} value={wp.id}>
                {wp.name}
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label={t('fields.phase')} htmlFor={`${id}-ph`}>
          <select id={`${id}-ph`} className={selectClassName} value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            <option value="">{t('fields.none')}</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>
        </FormRow>
        <FormRow label={t('fields.description')} htmlFor={`${id}-d`} className="md:col-span-2">
          <Textarea id={`${id}-d`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormRow>
        <FormRow
          label={t('fields.requiredAcknowledgements')}
          htmlFor={`${id}-a`}
          hint={t('fields.acknowledgementsHint')}
          className="md:col-span-2"
        >
          <Textarea id={`${id}-a`} value={addAcknowledgements} onChange={(e) => setAddAcknowledgements(e.target.value)} rows={2} />
        </FormRow>
        <div className="md:col-span-2">
          <FormError message={error} />
        </div>
        <div className="md:col-span-2">
          <Actions pending={pending} onCancel={onDone} label={t('actions.save')} />
        </div>
      </form>
    </PanelShell>
  );
}

function InviteForm({ view, options, onDone }: { view: ManagePanelView; options: CoordinationFormOptionsView; onDone: () => void }) {
  const t = useTranslations('coordination');
  const { pending, error, submit } = useSubmit();
  const available = options.contractors.filter((option) => !view.invitedAgreementIds.includes(option.agreementId));
  const team = options.team.filter((member) => !view.invitedUserIds.includes(member.userId));
  const [selected, setSelected] = useState<Record<string, { required: boolean; trade: string }>>({});
  const [users, setUsers] = useState<string[]>([]);

  return (
    <PanelShell title={t('invite.title')} description={t('invite.contractorsHint')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(
            () =>
              inviteCoordinationParticipantsAction({
                projectId: view.projectId,
                eventId: view.eventId,
                contractors: Object.entries(selected).map(([agreementId, value]) => ({
                  vendorId: options.contractors.find((option) => option.agreementId === agreementId)!.vendorId,
                  subcontractAgreementId: agreementId,
                  tradeLabel: value.trade || null,
                  isRequired: value.required,
                })),
                internalUserIds: users,
              }),
            onDone,
          );
        }}
      >
        {available.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.noContractorsAvailable')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {available.map((option) => {
              const value = selected[option.agreementId];
              return (
                <li key={option.agreementId} className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-2 sm:flex-row sm:items-center">
                  <label className="flex min-h-11 flex-1 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={Boolean(value)}
                      onChange={(e) =>
                        setSelected((current) => {
                          const next = { ...current };
                          if (e.target.checked) next[option.agreementId] = { required: true, trade: '' };
                          else delete next[option.agreementId];
                          return next;
                        })
                      }
                    />
                    {option.vendorName} · {option.agreementTitle}
                  </label>
                  {value ? (
                    <>
                      <Input
                        aria-label={t('fields.tradeLabel')}
                        placeholder={t('fields.tradeLabel')}
                        className="sm:w-40"
                        value={value.trade}
                        maxLength={80}
                        onChange={(e) =>
                          setSelected((current) => ({ ...current, [option.agreementId]: { ...value, trade: e.target.value } }))
                        }
                      />
                      <label className="flex min-h-11 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={value.required}
                          onChange={(e) =>
                            setSelected((current) => ({
                              ...current,
                              [option.agreementId]: { ...value, required: e.target.checked },
                            }))
                          }
                        />
                        {t('fields.required')}
                      </label>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {team.length > 0 ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{t('fields.internalParticipants')}</legend>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('invite.teamHint')}</p>
            {team.map((member) => (
              <label key={member.userId} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={users.includes(member.userId)}
                  onChange={() =>
                    setUsers((current) =>
                      current.includes(member.userId) ? current.filter((u) => u !== member.userId) : [...current, member.userId],
                    )
                  }
                />
                {member.displayName}
              </label>
            ))}
          </fieldset>
        ) : null}
        <FormError message={error} />
        <Actions pending={pending} onCancel={onDone} label={t('actions.invite')} />
      </form>
    </PanelShell>
  );
}

function OverrideForm({ view, onDone }: { view: ManagePanelView; onDone: () => void }) {
  const t = useTranslations('coordination');
  const id = useId();
  const { pending, error, fieldErrors, submit } = useSubmit();
  const decisions: CoordinationOverrideDecision[] = view.overridden
    ? ['cleared', 'force_ready', 'force_not_ready']
    : ['force_ready', 'force_not_ready'];
  const [decision, setDecision] = useState<CoordinationOverrideDecision>(decisions[0]!);
  const [reason, setReason] = useState('');

  return (
    <PanelShell title={t('override.title')} description={t('override.description')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(
            () => overrideCoordinationReadinessAction({ projectId: view.projectId, eventId: view.eventId, decision, reason }),
            onDone,
          );
        }}
      >
        <div className="flex flex-col gap-1" role="radiogroup">
          {decisions.map((value) => (
            <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
              <input type="radio" name={`${id}-d`} className="size-4" checked={decision === value} onChange={() => setDecision(value)} />
              {t(`override.${value}`)}
            </label>
          ))}
        </div>
        <FormRow label={t('fields.reason')} htmlFor={`${id}-r`} error={fieldErrors.reason}>
          <Textarea
            id={`${id}-r`}
            value={reason}
            placeholder={t('override.reasonPlaceholder')}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </FormRow>
        <FormError message={error} />
        <Actions pending={pending} onCancel={onDone} label={t('actions.save')} />
      </form>
    </PanelShell>
  );
}

function RescheduleForm({ view, onDone }: { view: ManagePanelView; onDone: () => void }) {
  const t = useTranslations('coordination');
  const id = useId();
  const { pending, error, fieldErrors, submit } = useSubmit();
  const [startsAt, setStartsAt] = useState(view.startsAtLocal);
  const [endsAt, setEndsAt] = useState(view.endsAtLocal);
  const [preparationDeadline, setPreparationDeadline] = useState('');
  const [reason, setReason] = useState('');
  const [requiresReconfirmation, setRequiresReconfirmation] = useState(true);

  return (
    <PanelShell title={t('reschedule.title')}>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(
            () =>
              rescheduleCoordinationEventAction({
                projectId: view.projectId,
                eventId: view.eventId,
                startsAt,
                endsAt: endsAt || null,
                preparationDeadline: preparationDeadline || null,
                reason,
                requiresReconfirmation,
              }),
            onDone,
          );
        }}
      >
        <FormRow label={t('fields.startsAt')} htmlFor={`${id}-s`} error={fieldErrors.startsAt}>
          <Input id={`${id}-s`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        </FormRow>
        <FormRow label={t('fields.endsAt')} htmlFor={`${id}-e`} error={fieldErrors.endsAt}>
          <Input id={`${id}-e`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </FormRow>
        <FormRow
          label={t('fields.preparationDeadline')}
          htmlFor={`${id}-p`}
          hint={t('reschedule.preparationHint')}
          error={fieldErrors.preparationDeadline}
          className="md:col-span-2"
        >
          <Input id={`${id}-p`} type="datetime-local" value={preparationDeadline} onChange={(e) => setPreparationDeadline(e.target.value)} />
        </FormRow>
        <FormRow label={t('fields.reason')} htmlFor={`${id}-r`} error={fieldErrors.reason} className="md:col-span-2">
          <Textarea id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value)} required />
        </FormRow>
        <label className="flex min-h-11 items-start gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={requiresReconfirmation}
            onChange={(e) => setRequiresReconfirmation(e.target.checked)}
          />
          <span>
            {t('reschedule.requiresReconfirmation')}
            <span className="block text-xs text-[var(--pf-text-muted)]">{t('reschedule.requiresReconfirmationHint')}</span>
          </span>
        </label>
        <div className="md:col-span-2">
          <FormError message={error} />
        </div>
        <div className="md:col-span-2">
          <Actions pending={pending} onCancel={onDone} label={t('actions.reschedule')} />
        </div>
      </form>
    </PanelShell>
  );
}

function OutcomeForm({ view, onDone }: { view: ManagePanelView; onDone: () => void }) {
  const t = useTranslations('coordination');
  const id = useId();
  const { pending, error, fieldErrors, submit } = useSubmit();
  const [outcome, setOutcome] = useState<CoordinationOutcome>(view.allowedOutcomes[0]!);
  const [actualStartAt, setActualStartAt] = useState(view.startsAtLocal);
  const [actualEndAt, setActualEndAt] = useState(view.endsAtLocal);
  const [note, setNote] = useState('');
  const needsTimes = outcome === 'completed' || outcome === 'partially_completed';

  return (
    <PanelShell title={t('outcome.title')} description={t('outcome.description')}>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(
            () =>
              recordCoordinationOutcomeAction({
                projectId: view.projectId,
                eventId: view.eventId,
                outcome,
                actualStartAt: needsTimes ? actualStartAt || null : null,
                actualEndAt: needsTimes ? actualEndAt || null : null,
                note: note || null,
              }),
            onDone,
          );
        }}
      >
        <FormRow label={t('fields.status')} htmlFor={`${id}-o`} className="md:col-span-2">
          <select id={`${id}-o`} className={selectClassName} value={outcome} onChange={(e) => setOutcome(e.target.value as CoordinationOutcome)}>
            {view.allowedOutcomes.map((value) => (
              <option key={value} value={value}>
                {t(`outcomes.${value}`)}
              </option>
            ))}
          </select>
        </FormRow>
        {needsTimes ? (
          <>
            <FormRow label={t('fields.actualStartAt')} htmlFor={`${id}-as`} error={fieldErrors.actualStartAt}>
              <Input id={`${id}-as`} type="datetime-local" value={actualStartAt} onChange={(e) => setActualStartAt(e.target.value)} />
            </FormRow>
            <FormRow label={t('fields.actualEndAt')} htmlFor={`${id}-ae`} error={fieldErrors.actualEndAt}>
              <Input id={`${id}-ae`} type="datetime-local" value={actualEndAt} onChange={(e) => setActualEndAt(e.target.value)} />
            </FormRow>
          </>
        ) : null}
        <FormRow label={t('fields.note')} htmlFor={`${id}-n`} error={fieldErrors.note} className="md:col-span-2">
          <Textarea id={`${id}-n`} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormRow>
        <div className="md:col-span-2">
          <FormError message={error} />
        </div>
        <div className="md:col-span-2">
          <Actions pending={pending} onCancel={onDone} label={t('actions.recordOutcome')} />
        </div>
      </form>
    </PanelShell>
  );
}

function DocumentForm({ view, options, onDone }: { view: ManagePanelView; options: CoordinationFormOptionsView; onDone: () => void }) {
  const t = useTranslations('coordination');
  const id = useId();
  const { pending, error, submit } = useSubmit();
  const available = options.documents.filter((document) => !view.linkedDocumentIds.includes(document.id));
  const [documentId, setDocumentId] = useState('');
  const [contractorVisible, setContractorVisible] = useState(true);

  return (
    <PanelShell title={t('actions.linkDocument')}>
      {available.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('documents.noneAvailable')}</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!documentId) return;
            submit(
              () =>
                linkCoordinationDocumentAction({ projectId: view.projectId, eventId: view.eventId, documentId, contractorVisible }),
              onDone,
            );
          }}
        >
          <FormRow label={t('documents.select')} htmlFor={`${id}-doc`}>
            <select id={`${id}-doc`} className={selectClassName} value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
              <option value="">{t('documents.select')}</option>
              {available.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.title}
                </option>
              ))}
            </select>
          </FormRow>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={contractorVisible} onChange={(e) => setContractorVisible(e.target.checked)} />
            {t('fields.contractorVisible')}
          </label>
          <FormError message={error} />
          <Actions pending={pending} onCancel={onDone} label={t('actions.linkDocument')} />
        </form>
      )}
    </PanelShell>
  );
}

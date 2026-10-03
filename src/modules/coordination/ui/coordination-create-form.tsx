'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, useTransition } from 'react';
import { EVENT_KINDS } from '../domain/constants';
import type { CoordinationEventKind } from '../domain/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/shared/i18n/navigation';
import { createCoordinationEventAction } from '../actions/internal-actions';
import type { CoordinationFormOptionsView } from './types';
import { FormError, FormRow, selectClassName } from './form-controls';

interface ContractorDraft {
  readonly key: string;
  agreementId: string;
  tradeLabel: string;
  isRequired: boolean;
}

export function CoordinationCreateForm({
  projectId,
  options,
  cancelHref,
}: {
  projectId: string;
  options: CoordinationFormOptionsView;
  cancelHref: string;
}) {
  const t = useTranslations('coordination');
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CoordinationEventKind>('concrete_pour');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [preparationDeadline, setPreparationDeadline] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [workPackageId, setWorkPackageId] = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [description, setDescription] = useState('');
  const [acknowledgements, setAcknowledgements] = useState('');
  const [contractors, setContractors] = useState<ContractorDraft[]>([]);
  const [internalUserIds, setInternalUserIds] = useState<string[]>([]);
  const [documentIds, setDocumentIds] = useState<string[]>([]);

  const agreementById = new Map(options.contractors.map((option) => [option.agreementId, option]));
  const phases = options.structure.phases.filter((phase) => !workPackageId || phase.workPackageId === workPackageId);

  function addContractor() {
    setContractors((current) => [
      ...current,
      { key: `${Date.now()}-${current.length}`, agreementId: '', tradeLabel: '', isRequired: true },
    ]);
  }

  function updateContractor(key: string, patch: Partial<ContractorDraft>) {
    setContractors((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createCoordinationEventAction({
        projectId,
        title,
        kind,
        startsAt,
        endsAt: endsAt || null,
        preparationDeadline: preparationDeadline || null,
        locationId: locationId || null,
        locationNote: locationNote || null,
        workPackageId: workPackageId || null,
        phaseId: phaseId || null,
        description: description || null,
        requiredAcknowledgements: acknowledgements.split('\n'),
        contractors: contractors
          .filter((row) => agreementById.has(row.agreementId))
          .map((row) => ({
            vendorId: agreementById.get(row.agreementId)!.vendorId,
            subcontractAgreementId: row.agreementId,
            tradeLabel: row.tradeLabel || null,
            isRequired: row.isRequired,
          })),
        internalUserIds,
        documentIds,
      });
      if (result.ok) {
        router.push(`${cancelHref}/${result.data.eventId}`);
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('create.title')}</CardTitle>
        <CardDescription>{t('create.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <FormRow label={t('fields.title')} htmlFor={`${id}-title`} error={fieldErrors.title} className="md:col-span-2">
              <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
            </FormRow>
            <FormRow label={t('fields.kind')} htmlFor={`${id}-kind`}>
              <select
                id={`${id}-kind`}
                className={selectClassName}
                value={kind}
                onChange={(e) => setKind(e.target.value as CoordinationEventKind)}
              >
                {EVENT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`kinds.${value}`)}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('fields.location')} htmlFor={`${id}-location`} error={fieldErrors.locationId}>
              <select
                id={`${id}-location`}
                className={selectClassName}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                <option value="">{t('fields.none')}</option>
                {options.structure.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('fields.startsAt')} htmlFor={`${id}-start`} error={fieldErrors.startsAt}>
              <Input id={`${id}-start`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            </FormRow>
            <FormRow label={t('fields.endsAt')} htmlFor={`${id}-end`} error={fieldErrors.endsAt}>
              <Input id={`${id}-end`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </FormRow>
            <FormRow label={t('fields.preparationDeadline')} htmlFor={`${id}-prep`} error={fieldErrors.preparationDeadline}>
              <Input
                id={`${id}-prep`}
                type="datetime-local"
                value={preparationDeadline}
                onChange={(e) => setPreparationDeadline(e.target.value)}
              />
            </FormRow>
            <FormRow label={t('fields.locationNote')} htmlFor={`${id}-locnote`}>
              <Input id={`${id}-locnote`} value={locationNote} onChange={(e) => setLocationNote(e.target.value)} maxLength={200} />
            </FormRow>
            <FormRow label={t('fields.workPackage')} htmlFor={`${id}-wp`} error={fieldErrors.workPackageId}>
              <select
                id={`${id}-wp`}
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
            <FormRow label={t('fields.phase')} htmlFor={`${id}-phase`} error={fieldErrors.phaseId}>
              <select id={`${id}-phase`} className={selectClassName} value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                <option value="">{t('fields.none')}</option>
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label={t('fields.description')} htmlFor={`${id}-desc`} className="md:col-span-2">
              <Textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} />
            </FormRow>
            <FormRow
              label={t('fields.requiredAcknowledgements')}
              htmlFor={`${id}-acks`}
              hint={t('fields.acknowledgementsHint')}
              className="md:col-span-2"
            >
              <Textarea id={`${id}-acks`} value={acknowledgements} onChange={(e) => setAcknowledgements(e.target.value)} rows={3} />
            </FormRow>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-semibold text-[var(--pf-text-primary)]">{t('fields.contractors')}</legend>
            {fieldErrors.contractors ? (
              <p role="alert" className="text-xs text-[var(--pf-action-danger)]">
                {fieldErrors.contractors}
              </p>
            ) : null}
            {options.contractors.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.noContractorsAvailable')}</p>
            ) : (
              <>
                {contractors.map((row) => (
                  <div
                    key={row.key}
                    className="grid gap-2 rounded-lg border border-[var(--pf-border-default)] p-3 md:grid-cols-[2fr_1fr_auto_auto] md:items-end"
                  >
                    <FormRow label={t('fields.agreement')} htmlFor={`${id}-${row.key}-a`}>
                      <select
                        id={`${id}-${row.key}-a`}
                        className={selectClassName}
                        value={row.agreementId}
                        onChange={(e) => updateContractor(row.key, { agreementId: e.target.value })}
                      >
                        <option value="">{t('create.selectContractor')}</option>
                        {options.contractors.map((option) => (
                          <option key={option.agreementId} value={option.agreementId}>
                            {option.vendorName} · {option.agreementTitle}
                          </option>
                        ))}
                      </select>
                    </FormRow>
                    <FormRow label={t('fields.tradeLabel')} htmlFor={`${id}-${row.key}-t`}>
                      <Input
                        id={`${id}-${row.key}-t`}
                        value={row.tradeLabel}
                        maxLength={80}
                        onChange={(e) => updateContractor(row.key, { tradeLabel: e.target.value })}
                      />
                    </FormRow>
                    <label className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={row.isRequired}
                        onChange={(e) => updateContractor(row.key, { isRequired: e.target.checked })}
                      />
                      {t('fields.required')}
                    </label>
                    <Button
                      type="button"
                      variant="dangerGhost"
                      size="sm"
                      onClick={() => setContractors((current) => current.filter((item) => item.key !== row.key))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {t('create.removeContractor')}
                    </Button>
                  </div>
                ))}
                <div>
                  <Button type="button" variant="secondary" size="sm" onClick={addContractor}>
                    <Plus className="size-4" aria-hidden />
                    {t('create.addContractor')}
                  </Button>
                </div>
              </>
            )}
          </fieldset>

          {options.team.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-[var(--pf-text-primary)]">{t('fields.internalParticipants')}</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {options.team.map((member) => (
                  <label key={member.userId} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={internalUserIds.includes(member.userId)}
                      onChange={() => setInternalUserIds((current) => toggle(current, member.userId))}
                    />
                    {member.displayName}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {options.documents.length > 0 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-[var(--pf-text-primary)]">{t('fields.documents')}</legend>
              <div className="grid max-h-56 gap-1 overflow-y-auto sm:grid-cols-2">
                {options.documents.map((document) => (
                  <label key={document.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={documentIds.includes(document.id)}
                      onChange={() => setDocumentIds((current) => toggle(current, document.id))}
                    />
                    <span className="truncate">{document.title}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <FormError message={error} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => router.push(cancelHref)}>
              {t('create.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t('create.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

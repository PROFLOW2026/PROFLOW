'use client';

import { useActionState, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeFormDialogs } from '@/components/patterns/business-change-form-dialogs';
import type { DuplicateRecordWarningItem } from '@/components/patterns/duplicate-record-warning-dialog';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import { formatPercentDisplay } from '@/shared/number/display';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { contractStatusActions } from '@/modules/projects/domain/contract-lifecycle';
import { fromNumericString } from '@/shared/money';
import { cn } from '@/shared/ui/cn';
import {
  createAdditionalContractAction,
  previewSimilarContractsAction,
  setPrimaryContractAction,
  updateContractAction,
  type ContractFormState,
} from './contract-actions';

export interface ProjectContractCard {
  readonly id: string;
  readonly name: string | null;
  readonly contractNumber: string | null;
  readonly contractType: string;
  readonly isPrimary: boolean;
  readonly status: string;
  readonly originalValueAmount: string | null;
  readonly currentValueAmount: string | null;
  readonly currency: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly retentionPercent: string | null;
  readonly notes: string | null;
}

interface ProjectContractsClientProps {
  readonly projectId: string;
  readonly currency: string;
  readonly contracts: readonly ProjectContractCard[];
  readonly canManage: boolean;
  readonly isOwner: boolean;
}

function statusShape(status: string): 'draft' | 'active' | 'completed' | 'cancelled' | 'archived' {
  if (status === 'draft') return 'draft';
  if (status === 'closed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'archived') return 'archived';
  return 'active';
}

function ContractEditForm({
  projectId,
  contract,
  pending,
  error,
  action,
  onCancel,
  needsRetroConfirm,
}: {
  projectId: string;
  contract: ProjectContractCard;
  pending: boolean;
  error?: string;
  action: (formData: FormData) => void;
  onCancel: () => void;
  needsRetroConfirm: boolean;
}) {
  const t = useTranslations('projects.contracts');
  const tRetro = useTranslations('projects.contracts.retroactiveEdit');
  const tCommon = useTranslations('common');
  const formRef = useRef<HTMLFormElement>(null);
  const skipConfirmRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<readonly DuplicateRecordWarningItem[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<Record<string, string> | null>(null);

  function readFormSnapshot(): Record<string, string> {
    const form = formRef.current;
    if (!form) return {};
    const data = new FormData(form);
    const read = (name: string) => String(data.get(name) ?? '').trim();
    return {
      name: read('name'),
      contractNumber: read('contractNumber'),
      contractType: read('contractType'),
      startDate: read('startDate'),
      endDate: read('endDate'),
      retentionPercent: read('retentionPercent'),
      notes: read('notes'),
    };
  }

  const changeDiffs = useMemo((): BusinessChangeFieldDiff[] => {
    if (!snapshot) return [];
    const rows: BusinessChangeFieldDiff[] = [];
    const push = (fieldLabel: string, before: string | null, after: string) => {
      const b = (before ?? '').trim() || '—';
      const a = after.trim() || '—';
      if (b !== a) rows.push({ fieldLabel, before: b, after: a });
    };
    push(t('name'), contract.name, snapshot.name ?? '');
    push(t('number'), contract.contractNumber, snapshot.contractNumber ?? '');
    push(t('startDate'), contract.startDate, snapshot.startDate ?? '');
    push(t('endDate'), contract.endDate, snapshot.endDate ?? '');
    push(t('retention'), contract.retentionPercent, snapshot.retentionPercent ?? '');
    push(t('notes'), contract.notes, snapshot.notes ?? '');
    return rows;
  }, [contract, snapshot, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!needsRetroConfirm || skipConfirmRef.current) {
      skipConfirmRef.current = false;
      return;
    }
    event.preventDefault();
    const snap = readFormSnapshot();
    setSnapshot(snap);
    setSimilarLoading(true);
    try {
      const rows = await previewSimilarContractsAction({
        excludeContractId: contract.id,
        projectId,
        contractNumber: snap.contractNumber || null,
        name: snap.name || null,
      });
      const matches: DuplicateRecordWarningItem[] = rows.map((row) => ({
        id: row.id,
        href: `/projects/${row.projectId}?tab=details`,
        title: row.contractNumber ?? row.name ?? row.id,
        reason: tRetro('duplicateReason'),
      }));
      setSimilarMatches(matches);
      if (matches.length > 0) {
        setDuplicateOpen(true);
        return;
      }
      setConfirmOpen(true);
    } finally {
      setSimilarLoading(false);
    }
  }

  function confirmSave() {
    skipConfirmRef.current = true;
    setConfirmOpen(false);
    const ack = formRef.current?.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
    if (ack) ack.value = 'true';
    formRef.current?.requestSubmit();
  }

  return (
    <>
    <form
      ref={formRef}
      action={action}
      onSubmit={handleSubmit}
      className="mt-3 flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="contractId" value={contract.id} />
      <input type="hidden" name="changeAcknowledged" value="false" />
      <Field label={t('name')}>
        {(controlProps) => (
          <Input {...controlProps} name="name" defaultValue={contract.name ?? ''} />
        )}
      </Field>
      <Field label={t('number')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="contractNumber"
            defaultValue={contract.contractNumber ?? ''}
          />
        )}
      </Field>
      {contract.isPrimary ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('primaryTypeLocked')}</p>
      ) : (
        <Field label={t('kind')}>
          {(controlProps) => (
            <select
              {...controlProps}
              name="contractType"
              defaultValue={contract.contractType === 'secondary' ? 'secondary' : 'additional'}
              className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
            >
              <option value="additional">{t('types.additional')}</option>
              <option value="secondary">{t('types.secondary')}</option>
            </select>
          )}
        </Field>
      )}
      <Field label={t('startDate')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="startDate"
            type="date"
            dir="ltr"
            defaultValue={contract.startDate ?? ''}
          />
        )}
      </Field>
      <Field label={t('endDate')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="endDate"
            type="date"
            dir="ltr"
            defaultValue={contract.endDate ?? ''}
          />
        )}
      </Field>
      <Field label={t('retention')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="retentionPercent"
            inputMode="decimal"
            dir="ltr"
            defaultValue={contract.retentionPercent ?? ''}
          />
        )}
      </Field>
      <Field label={t('notes')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => (
          <Textarea {...controlProps} name="notes" rows={3} defaultValue={contract.notes ?? ''} />
        )}
      </Field>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('amountNotEdited')}</p>
      {error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || similarLoading} loading={pending || similarLoading}>
          {t('saveEdit')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon('actions.cancel')}
        </Button>
      </div>
    </form>
    <BusinessChangeFormDialogs
      confirmOpen={confirmOpen}
      setConfirmOpen={setConfirmOpen}
      duplicateOpen={duplicateOpen}
      setDuplicateOpen={setDuplicateOpen}
      pending={pending}
      changes={changeDiffs}
      similarMatches={similarMatches}
      confirmTitle={tRetro('confirmTitle')}
      confirmDescription={tRetro('confirmDescription')}
      duplicateTitle={tRetro('duplicateTitle')}
      duplicateDescription={tRetro('duplicateDescription')}
      onConfirm={confirmSave}
      onBackToEdit={() => {
        setConfirmOpen(false);
        setDuplicateOpen(false);
      }}
      onContinuePastDuplicate={() => setConfirmOpen(true)}
    />
    </>
  );
}

export function ProjectContractsClient({
  projectId,
  currency,
  contracts,
  canManage,
  isOwner,
}: ProjectContractsClientProps) {
  const t = useTranslations('projects.contracts');
  const tCommon = useTranslations('common');
  const [showForm, setShowForm] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createState, createAction, createPending] = useActionState<ContractFormState, FormData>(
    createAdditionalContractAction,
    {},
  );
  const [primaryState, primaryAction, primaryPending] = useActionState<ContractFormState, FormData>(
    setPrimaryContractAction,
    {},
  );
  const [updateState, updateAction, updatePending] = useActionState<ContractFormState, FormData>(
    updateContractAction,
    {},
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {contracts.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          {contracts.map((contract) => {
            const original = contract.originalValueAmount
              ? fromNumericString(contract.originalValueAmount, contract.currency)
              : null;
            const current = contract.currentValueAmount
              ? fromNumericString(contract.currentValueAmount, contract.currency)
              : original;
            const statusActions = canManage ? contractStatusActions(contract.status) : [];
            return (
              <li
                key={contract.id}
                className="min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 text-start"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {contract.name ?? contract.contractNumber ?? t('untitled')}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">
                      {t(`types.${contract.contractType}`)}
                      {contract.isPrimary ? ` · ${t('primaryBadge')}` : null}
                    </p>
                  </div>
                  <StatusBadge shape={statusShape(contract.status)} label={t(`status.${contract.status}`)} />
                </div>
                <dl className="mt-3 flex flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--pf-text-secondary)]">{t('original')}</dt>
                    <dd>{original ? <MoneyText value={original} /> : '-'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--pf-text-secondary)]">{t('current')}</dt>
                    <dd>{current ? <MoneyText value={current} /> : '-'}</dd>
                  </div>
                  {contract.startDate || contract.endDate || contract.retentionPercent ? (
                    <div className="mt-1 text-xs text-[var(--pf-text-muted)]">
                      {contract.startDate || contract.endDate
                        ? `${contract.startDate ?? '-'} → ${contract.endDate ?? '-'}`
                        : null}
                      {contract.retentionPercent
                        ? ` · ${t('retention')}: ${formatPercentDisplay(contract.retentionPercent)}`
                        : null}
                    </div>
                  ) : null}
                </dl>
                {canManage ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {editingId === contract.id ? (
                      <ContractEditForm
                        projectId={projectId}
                        contract={contract}
                        pending={updatePending}
                        error={updateState.error}
                        action={updateAction}
                        onCancel={() => setEditingId(null)}
                        needsRetroConfirm={
                          isOwner &&
                          (contract.status === 'closed' || contract.status === 'cancelled')
                        }
                      />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setEditingId(contract.id)}
                        >
                          {t('editAction')}
                        </Button>
                        {!contract.isPrimary ? (
                          <form action={primaryAction}>
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="contractId" value={contract.id} />
                            <Button type="submit" variant="secondary" disabled={primaryPending}>
                              {t('makePrimary')}
                            </Button>
                          </form>
                        ) : null}
                        {statusActions.map((nextStatus) => (
                          <form action={updateAction} key={nextStatus}>
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="contractId" value={contract.id} />
                            <input type="hidden" name="status" value={nextStatus} />
                            <Button type="submit" variant="secondary" disabled={updatePending}>
                              {t(`actions.${nextStatus}`)}
                            </Button>
                          </form>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {primaryState.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {primaryState.error}
        </p>
      ) : null}
      {updateState.error && !editingId ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
          {updateState.error}
        </p>
      ) : null}

      {canManage ? (
        showForm ? (
          <form
            action={createAction}
            className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="currency" value={currency} />
            <h3 className="text-sm font-semibold">{t('addTitle')}</h3>
            <Field label={t('name')}>
              {(controlProps) => <Input {...controlProps} name="name" />}
            </Field>
            <Field label={t('enteredAmount')} optionalLabel={tCommon('labels.optional')}>
              {(controlProps) => (
                <Input {...controlProps} name="enteredAmount" inputMode="decimal" dir="ltr" />
              )}
            </Field>
            <details
              className="rounded-md border border-[var(--pf-border-default)] p-3"
              open={showMore}
              onToggle={(event) => setShowMore((event.target as HTMLDetailsElement).open)}
            >
              <summary className={cn('cursor-pointer text-sm font-medium')}>{t('moreDetails')}</summary>
              <div className="mt-3 flex flex-col gap-3">
                <Field label={t('number')} optionalLabel={tCommon('labels.optional')}>
                  {(controlProps) => <Input {...controlProps} name="contractNumber" />}
                </Field>
                <Field label={t('kind')}>
                  {(controlProps) => (
                    <select
                      {...controlProps}
                      name="contractType"
                      defaultValue="additional"
                      className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="additional">{t('types.additional')}</option>
                      <option value="secondary">{t('types.secondary')}</option>
                    </select>
                  )}
                </Field>
                <Field label={t('startDate')} optionalLabel={tCommon('labels.optional')}>
                  {(controlProps) => <Input {...controlProps} name="startDate" type="date" dir="ltr" />}
                </Field>
                <Field label={t('endDate')} optionalLabel={tCommon('labels.optional')}>
                  {(controlProps) => <Input {...controlProps} name="endDate" type="date" dir="ltr" />}
                </Field>
                <Field label={t('retention')} optionalLabel={tCommon('labels.optional')}>
                  {(controlProps) => (
                    <Input {...controlProps} name="retentionPercent" inputMode="decimal" dir="ltr" />
                  )}
                </Field>
                <Field label={t('notes')} optionalLabel={tCommon('labels.optional')}>
                  {(controlProps) => <Textarea {...controlProps} name="notes" rows={3} />}
                </Field>
              </div>
            </details>
            {createState.error ? (
              <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
                {createState.error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={createPending} loading={createPending}>
                {t('addSubmit')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                {tCommon('actions.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setShowForm(true)}>
            {t('addAction')}
          </Button>
        )
      ) : null}
    </div>
  );
}

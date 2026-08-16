'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
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
}: {
  projectId: string;
  contract: ProjectContractCard;
  pending: boolean;
  error?: string;
  action: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('projects.contracts');
  const tCommon = useTranslations('common');

  return (
    <form
      action={action}
      className="mt-3 flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="contractId" value={contract.id} />
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
        <Button type="submit" disabled={pending} loading={pending}>
          {t('saveEdit')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {tCommon('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function ProjectContractsClient({
  projectId,
  currency,
  contracts,
  canManage,
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
                    <dd>{original ? <MoneyText value={original} compact /> : '-'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--pf-text-secondary)]">{t('current')}</dt>
                    <dd>{current ? <MoneyText value={current} compact /> : '-'}</dd>
                  </div>
                  {contract.startDate || contract.endDate || contract.retentionPercent ? (
                    <div className="mt-1 text-xs text-[var(--pf-text-muted)]">
                      {contract.startDate || contract.endDate
                        ? `${contract.startDate ?? '-'} → ${contract.endDate ?? '-'}`
                        : null}
                      {contract.retentionPercent
                        ? ` · ${t('retention')}: ${contract.retentionPercent}%`
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

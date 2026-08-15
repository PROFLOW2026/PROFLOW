'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { MoneyInput } from '@/components/patterns/money-input';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pressableClassName } from '@/components/ui/pressable';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/shared/ui/cn';
import type { BillingContractOption, ProjectOption } from '@/modules/billing/domain/types';
import { RetentionCaptureFields } from '@/modules/retention/ui/retention-capture-fields';
import { createBillingRecordAction, type BillingFormState } from './actions';

interface BillingRecordFormProps {
  projects: readonly ProjectOption[];
  contracts?: readonly BillingContractOption[];
  defaultProjectId?: string;
  defaultContractId?: string;
  defaultCurrency?: string;
  defaultIssueDate: string;
}

export function BillingRecordForm({
  projects,
  contracts = [],
  defaultProjectId,
  defaultContractId,
  defaultCurrency,
  defaultIssueDate,
}: BillingRecordFormProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [contractId, setContractId] = useState(defaultContractId ?? '');
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    createBillingRecordAction,
    {},
  );

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-5">
      {state.error ? (
        <p className="text-sm text-[var(--pf-status-danger-fg)]">{tCommon('actions.retry')}</p>
      ) : null}

      <Field label={t('form.project')} required>
        {(controlProps) => (
          <>
            <Select name="projectId" value={projectId} onValueChange={setProjectId} required>
              <SelectTrigger {...controlProps}>
                <SelectValue placeholder={t('form.projectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="projectId" value={projectId} />
          </>
        )}
      </Field>

      {contracts.filter((row) => row.projectId === projectId).length > 1 ? (
        <Field label={t('form.contract')} optionalLabel={tCommon('labels.optional')}>
          {(controlProps) => (
            <>
              <Select
                name="contractId"
                value={contractId}
                onValueChange={setContractId}
              >
                <SelectTrigger {...controlProps}>
                  <SelectValue placeholder={t('form.contractPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {contracts
                    .filter((row) => row.projectId === projectId)
                    .map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.name ??
                          contract.contractNumber ??
                          (contract.isPrimary ? t('form.contractPrimary') : contract.id.slice(0, 8))}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="contractId" value={contractId} />
            </>
          )}
        </Field>
      ) : null}

      <Field label={t('form.amount')} required>
        {(controlProps) => (
          <>
            <MoneyInput
              {...controlProps}
              required
              value={amount}
              onValueChange={setAmount}
            />
            <input type="hidden" name="amount" value={amount} />
          </>
        )}
      </Field>

      <input type="hidden" name="currency" value={defaultCurrency ?? ''} />

      <Field label={t('form.issueDate')} required>
        {(controlProps) => (
          <Input {...controlProps} name="issueDate" type="date" required defaultValue={defaultIssueDate} dir="ltr" />
        )}
      </Field>

      <Field label={t('form.dueDate')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Input {...controlProps} name="dueDate" type="date" dir="ltr" />}
      </Field>

      <Field label={t('form.reference')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Input {...controlProps} name="reference" autoComplete="off" />}
      </Field>

      <Field label={t('form.notes')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => <Textarea {...controlProps} name="notes" rows={3} />}
      </Field>

      <RetentionCaptureFields
        namespace="billing.retention"
        currency={defaultCurrency ?? 'ILS'}
        totalAmount={amount || '0'}
      />

      <details className="rounded-md border border-[var(--pf-border-default)] p-3">
        <summary
          className={cn(
            pressableClassName,
            'cursor-pointer text-sm font-medium active:scale-100 active:opacity-80',
          )}
        >
          {t('form.moreDetails')}
        </summary>
        <p className="mt-2 text-xs text-[var(--pf-text-muted)]">{t('form.moreDetailsHint')}</p>
      </details>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="finalize" value="false" disabled={pending || !amount || !projectId}>
          {t('form.saveDraft')}
        </Button>
        <Button
          type="submit"
          name="finalize"
          value="true"
          variant="secondary"
          disabled={pending || !amount || !projectId}
        >
          {t('form.saveAndFinalize')}
        </Button>
      </div>
    </form>
  );
}

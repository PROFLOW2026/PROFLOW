'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useRouter } from '@/shared/i18n/navigation';
import type { CollabActionState } from '../shared/action-state.types';
import { assignTaskToContractorAction } from './actions';

export interface TaskContractorVendorChoice {
  readonly id: string;
  readonly label: string;
}

export interface TaskContractorAgreementChoice {
  readonly id: string;
  readonly vendorId: string;
  readonly label: string;
}

export interface TaskContractorPrincipalChoice {
  readonly id: string;
  readonly vendorId: string;
  readonly label: string;
}

export interface TaskContractorAssignChoices {
  readonly vendors: readonly TaskContractorVendorChoice[];
  readonly agreements: readonly TaskContractorAgreementChoice[];
  readonly principals: readonly TaskContractorPrincipalChoice[];
}

const SELECT_CLASS = 'min-h-11 w-full rounded-md border px-2 text-sm';

export function AssignTaskContractorForm({
  taskId,
  projectId,
  choices,
}: {
  readonly taskId: string;
  readonly projectId: string;
  readonly choices: TaskContractorAssignChoices;
}) {
  const t = useTranslations('collaboration');
  const router = useRouter();
  const [state, formAction, pending] = useActionState(assignTaskToContractorAction, {} as CollabActionState);
  const [vendorId, setVendorId] = useState('');
  const [agreementId, setAgreementId] = useState('');
  const [principalId, setPrincipalId] = useState('');

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.nonce, state.success]);

  const agreements = useMemo(
    () => choices.agreements.filter((row) => row.vendorId === vendorId),
    [choices.agreements, vendorId],
  );
  const principals = useMemo(
    () => choices.principals.filter((row) => row.vendorId === vendorId),
    [choices.principals, vendorId],
  );

  if (choices.vendors.length === 0) {
    return <p className="text-sm text-[var(--pf-text-secondary)]">{t('contractorPanel.empty')}</p>;
  }

  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="projectId" value={projectId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('contractorPanel.vendorLabel')} required>
        {(control) => (
          <select
            {...control}
            name="vendorId"
            required
            className={SELECT_CLASS}
            value={vendorId}
            onChange={(event) => {
              setVendorId(event.target.value);
              setAgreementId('');
              setPrincipalId('');
            }}
          >
            <option value="">{t('contractorPanel.vendorPlaceholder')}</option>
            {choices.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('contractorPanel.agreementLabel')} optionalLabel={t('contractorPanel.optional')}>
        {(control) => (
          <select
            {...control}
            name="subcontractAgreementId"
            className={SELECT_CLASS}
            value={agreementId}
            disabled={!vendorId}
            onChange={(event) => setAgreementId(event.target.value)}
          >
            <option value="">{t('contractorPanel.none')}</option>
            {agreements.map((agreement) => (
              <option key={agreement.id} value={agreement.id}>
                {agreement.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('contractorPanel.principalLabel')} optionalLabel={t('contractorPanel.optional')}>
        {(control) => (
          <select
            {...control}
            name="principalId"
            className={SELECT_CLASS}
            value={principalId}
            disabled={!vendorId}
            onChange={(event) => setPrincipalId(event.target.value)}
          >
            <option value="">{t('contractorPanel.none')}</option>
            {principals.map((principal) => (
              <option key={principal.id} value={principal.id}>
                {principal.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button
        type="submit"
        size="sm"
        className="w-full sm:w-auto"
        loading={pending}
        disabled={pending || !vendorId}
      >
        {pending ? t('contractorPanel.submitting') : t('contractorPanel.submit')}
      </Button>
    </form>
  );
}

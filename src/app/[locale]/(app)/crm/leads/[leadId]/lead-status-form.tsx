'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { LEAD_STATUSES, type LeadRecord } from '@/modules/crm/domain/types';
import { updateLeadStatusAction, type CrmFormState } from '../../actions';

export function LeadStatusForm({ lead }: { lead: LeadRecord }) {
  const t = useTranslations('crm.lead');
  const tStatuses = useTranslations('crm.statuses.lead');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    updateLeadStatusAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="leadId" value={lead.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('statusLabel')} className="min-w-[12rem] flex-1">
        {(control) => (
          <select
            {...control}
            name="status"
            defaultValue={lead.status}
            className="h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3"
          >
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {tStatuses(status)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Button type="submit" disabled={pending} className="self-start sm:self-auto">
        {t('updateStatus')}
      </Button>
    </form>
  );
}

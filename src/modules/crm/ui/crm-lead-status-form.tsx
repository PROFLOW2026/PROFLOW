'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { LEAD_STATUSES, type LeadRecord } from '@/modules/crm/domain/types';
import { updateLeadStatusAction, type CrmFormState } from '@/app/[locale]/(app)/crm/actions';

export function CrmLeadStatusForm({ lead }: { lead: LeadRecord }) {
  const t = useTranslations('crm.lead');
  const tStatuses = useTranslations('crm.statuses.lead');
  const [state, formAction, pending] = useActionState<CrmFormState, FormData>(
    updateLeadStatusAction,
    {},
  );

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="leadId" value={lead.id} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense className="items-end">
        <Field label={t('statusLabel')} className={mainAppFieldSpan.md}>
          {(control) => (
            <select
              {...control}
              name="status"
              defaultValue={lead.status}
              className="h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-start"
            >
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {tStatuses(status)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className={mainAppFieldSpan.sm}>
          <Button type="submit" loading={pending} className="w-full sm:w-auto">
            {t('updateStatus')}
          </Button>
        </div>
      </MainAppFormGrid>
    </form>
  );
}

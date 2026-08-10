'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import { setJobFixedPriceAction, type JobFormState } from '../actions';

interface JobOpenPricePanelProps {
  jobId: string;
  baseCurrency: string;
  currencySymbol: string;
  canManage: boolean;
}

export function JobOpenPricePanel({
  jobId,
  baseCurrency,
  currencySymbol,
  canManage,
}: JobOpenPricePanelProps) {
  const t = useTranslations('jobs');
  const [state, formAction, pending] = useActionState<JobFormState, FormData>(
    setJobFixedPriceAction,
    {},
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <Alert tone="info">{t('workspace.openPriceBanner')}</Alert>
      {canManage ? (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="jobId" value={jobId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{t('pricing.setPriceSubmit')}</Alert> : null}
          <ContractAmountFields
            baseCurrency={baseCurrency}
            currencySymbol={currencySymbol}
            amountError={state.fieldErrors?.priceAmount ?? state.fieldErrors?.contractValueAmount}
            taxModeError={state.fieldErrors?.amountIncludesTax}
            optional={false}
            showOpeningReduction={false}
            amountLabel={t('pricing.priceLabel')}
            amountDescription={t('pricing.priceHint')}
            amountPlaceholder={t('pricing.pricePlaceholder')}
            taxModeDescription={t('pricing.taxModeHint')}
          />
          <Button type="submit" loading={pending} className="self-start">
            {t('pricing.setPrice')}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

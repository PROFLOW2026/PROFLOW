'use client';



import { useEffect, useActionState } from 'react';

import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';

import { useRouter } from '@/shared/i18n/navigation';

import {

  createPurchaseOrderFromQuoteAction,

  setSupplierQuoteStatusAction,

  updateRfqStatusAction,

  type ProcurementFormState,

} from '../../actions';



export function RfqStatusButton({

  rfqId,

  status,

  label,

}: {

  rfqId: string;

  status: string;

  label: string;

}) {

  const router = useRouter();

  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(

    updateRfqStatusAction,

    {},

  );



  useEffect(() => {

    if (state.success) router.refresh();

  }, [router, state.success]);



  return (

    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">

      <input type="hidden" name="rfqId" value={rfqId} />

      <input type="hidden" name="status" value={status} />

      <Button type="submit" size="sm" variant="secondary" loading={pending}>

        {label}

      </Button>

      {state.error ? (

        <span role="alert" className="text-xs text-[var(--pf-status-danger-fg)]">

          {state.error}

        </span>

      ) : null}

    </form>

  );

}



export function AcceptQuoteButton({

  quoteId,

  rfqId,

}: {

  quoteId: string;

  rfqId: string;

}) {

  const t = useTranslations('procurement.quote');

  const router = useRouter();

  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(

    setSupplierQuoteStatusAction,

    {},

  );



  useEffect(() => {

    if (state.success) router.refresh();

  }, [router, state.success]);



  return (

    <form action={formAction} className="inline-flex flex-col items-start gap-1">

      <input type="hidden" name="quoteId" value={quoteId} />

      <input type="hidden" name="rfqId" value={rfqId} />

      <input type="hidden" name="status" value="accepted" />

      <Button type="submit" size="sm" variant="secondary" loading={pending}>

        {pending ? t('accepting') : t('accept')}

      </Button>

      {state.error ? (

        <span role="alert" className="text-xs text-[var(--pf-status-danger-fg)]">

          {state.error}

        </span>

      ) : null}

    </form>

  );

}



export function CreatePoFromQuoteButton({

  quoteId,

  rfqId,

}: {

  quoteId: string;

  rfqId: string;

}) {

  const t = useTranslations('procurement.quote');

  const [state, formAction, pending] = useActionState<ProcurementFormState, FormData>(

    createPurchaseOrderFromQuoteAction,

    {},

  );



  return (

    <form action={formAction} className="inline-flex flex-col items-start gap-1">

      <input type="hidden" name="quoteId" value={quoteId} />

      <input type="hidden" name="rfqId" value={rfqId} />

      <Button type="submit" size="sm" loading={pending} title={t('createPoHint')}>

        {pending ? t('creatingPo') : t('createPo')}

      </Button>

      {state.error ? (

        <span role="alert" className="text-xs text-[var(--pf-status-danger-fg)]">

          {state.error}

        </span>

      ) : null}

    </form>

  );

}



'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Link } from '@/shared/i18n/navigation';
import { createWorkOrderBillingAction, type WorkOrderFormState } from '../actions';

export function WorkOrderBillingForm({
  workOrderId,
  existingBillingRecordId,
  existingStatus,
  canBill,
}: {
  workOrderId: string;
  existingBillingRecordId: string | null;
  existingStatus: string | null;
  canBill: boolean;
}) {
  const t = useTranslations('service');
  const [state, formAction, pending] = useActionState<WorkOrderFormState, FormData>(
    createWorkOrderBillingAction,
    {},
  );

  if (existingBillingRecordId) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="text-base font-semibold">{t('billing.title')}</h2>
        <Alert tone="info">{t('billing.alreadyBilled', { status: existingStatus ?? 'draft' })}</Alert>
        <Link href={`/billing/${existingBillingRecordId}`} className="text-sm underline">
          {t('billing.openBilling')}
        </Link>
      </section>
    );
  }

  if (!canBill) return null;

  return (
    <form
      action={formAction}
      className="flex w-full min-w-0 max-w-3xl flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4"
    >
      <input type="hidden" name="workOrderId" value={workOrderId} />
      <div>
        <h2 className="text-base font-semibold">{t('billing.title')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('billing.hint')}</p>
      </div>
      <MainAppFormGrid dense>
        <Field label={t('billing.laborHours')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              id={control.id}
              name="laborHours"
              inputMode="decimal"
              className="pf-ltr-island"
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('billing.laborRate')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              id={control.id}
              name="laborRate"
              inputMode="decimal"
              className="pf-ltr-island"
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('billing.materialsAmount')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              id={control.id}
              name="materialsAmount"
              inputMode="decimal"
              className="pf-ltr-island"
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('billing.callOutFee')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              id={control.id}
              name="callOutFee"
              inputMode="decimal"
              className="pf-ltr-island"
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('billing.additionalCharges')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              id={control.id}
              name="additionalCharges"
              inputMode="decimal"
              className="pf-ltr-island"
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('billing.discountAmount')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input
              id={control.id}
              name="discountAmount"
              inputMode="decimal"
              className="pf-ltr-island"
              dir="ltr"
            />
          )}
        </Field>
        <Field label={t('billing.notes')} className={mainAppFieldSpan.full}>
        {(control) => <Textarea id={control.id} name="notes" rows={3} />}
        </Field>
      </MainAppFormGrid>
      <Button type="submit" loading={pending}>
        {t('billing.submit')}
      </Button>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{t('billing.created')}</Alert> : null}
    </form>
  );
}

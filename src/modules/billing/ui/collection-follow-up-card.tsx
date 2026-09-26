'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { buildWhatsAppShareUrl } from '@/modules/communications/domain/whatsapp-share';
import { COLLECTION_NOTE_MAX_LENGTH } from '@/modules/billing/domain/collection-follow-up';
import { Link } from '@/shared/i18n/navigation';
import type { BusinessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { formatMoney } from '@/shared/money/format';
import type { MoneyValue } from '@/shared/money/money';
import { updateCollectionFollowUpAction, type BillingFormState } from './actions';

function resolveBillingMessage(
  key: string,
  tBilling: ReturnType<typeof useTranslations<'billing'>>,
  tErrors: ReturnType<typeof useTranslations<'errors'>>,
): string {
  if (key.startsWith('billing.')) {
    return tBilling(key.slice('billing.'.length));
  }
  if (key.startsWith('errors.')) {
    return tErrors(key.slice('errors.'.length));
  }
  return key;
}

export function CollectionFollowUpCard({
  billingRecordId,
  canManage,
  showReminder,
  canPrepareReminder,
  reference,
  projectId,
  clientId,
  customerPhone,
  outstandingAmount,
  contactedAt,
  nextFollowUpAt,
  promiseToPayDate,
  note,
}: {
  readonly billingRecordId: string;
  readonly canManage: boolean;
  /** Owner communications composer. Hidden on the employee shell. */
  readonly showReminder: boolean;
  readonly canPrepareReminder: boolean;
  readonly reference: string | null;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly customerPhone: string | null;
  readonly outstandingAmount: MoneyValue;
  readonly contactedAt: BusinessDate | null;
  readonly nextFollowUpAt: BusinessDate | null;
  readonly promiseToPayDate: BusinessDate | null;
  readonly note: string | null;
}) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    updateCollectionFollowUpAction.bind(null, billingRecordId),
    {},
  );

  const reminderParams = new URLSearchParams({ entityType: 'payment_reminder' });
  reminderParams.set('entityId', billingRecordId);
  if (projectId) reminderParams.set('projectId', projectId);
  if (clientId) reminderParams.set('clientId', clientId);
  if (reference) reminderParams.set('subject', reference);

  const referenceLabel = reference ?? t('detail.title');
  const whatsAppUrl = buildWhatsAppShareUrl({
    phone: customerPhone,
    message: t('collection.whatsappMessage', {
      reference: referenceLabel,
      amount: formatMoney(outstandingAmount, locale),
    }),
  });

  const optional = tCommon('labels.optional');
  const fieldError = (path: string) =>
    state.fieldErrors?.[path] ? resolveBillingMessage(state.fieldErrors[path], t, tErrors) : null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-start">{t('collection.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4 text-start">
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('collection.description')}</p>

        <div className="flex flex-wrap gap-2">
          {showReminder && canPrepareReminder ? (
            <Button asChild variant="secondary">
              <Link href={`/communications/new?${reminderParams.toString()}`}>
                {t('collection.prepareReminder')}
              </Link>
            </Button>
          ) : null}
          {showReminder && !canPrepareReminder ? (
            <Button type="button" variant="secondary" disabled>
              {t('collection.prepareReminder')}
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <a href={whatsAppUrl} target="_blank" rel="noopener noreferrer">
              {t('collection.whatsapp')}
            </a>
          </Button>
        </div>

        {canManage ? (
          <form action={formAction} className="flex flex-col gap-4">
            {state.error ? (
              <p className="text-sm text-[var(--pf-status-danger-fg)]">
                {resolveBillingMessage(state.error, t, tErrors)}
              </p>
            ) : null}
            {state.saved ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('collection.saved')}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('collection.contactedAt')} optionalLabel={optional} error={fieldError('collectionContactedAt')}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="collectionContactedAt"
                    defaultValue={contactedAt ?? ''}
                  />
                )}
              </Field>
              <Field
                label={t('collection.nextFollowUpAt')}
                optionalLabel={optional}
                error={fieldError('collectionNextFollowUpAt')}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="collectionNextFollowUpAt"
                    defaultValue={nextFollowUpAt ?? ''}
                  />
                )}
              </Field>
              <Field
                label={t('collection.promiseToPayDate')}
                optionalLabel={optional}
                error={fieldError('collectionPromiseToPayDate')}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="collectionPromiseToPayDate"
                    defaultValue={promiseToPayDate ?? ''}
                  />
                )}
              </Field>
            </div>
            <Field label={t('collection.note')} optionalLabel={optional} error={fieldError('collectionNote')}>
              {(control) => (
                <Textarea
                  {...control}
                  name="collectionNote"
                  rows={2}
                  maxLength={COLLECTION_NOTE_MAX_LENGTH}
                  defaultValue={note ?? ''}
                />
              )}
            </Field>
            <div>
              <Button type="submit" disabled={pending}>
                {t('collection.save')}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('collection.contactedAt')}</dt>
              <dd dir="ltr">{contactedAt ? formatBusinessDate(contactedAt, locale) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('collection.nextFollowUpAt')}</dt>
              <dd dir="ltr">{nextFollowUpAt ? formatBusinessDate(nextFollowUpAt, locale) : '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('collection.promiseToPayDate')}</dt>
              <dd dir="ltr">{promiseToPayDate ? formatBusinessDate(promiseToPayDate, locale) : '—'}</dd>
            </div>
            {note ? (
              <div className="sm:col-span-2">
                <dt className="text-[var(--pf-text-secondary)]">{t('collection.note')}</dt>
                <dd className="whitespace-pre-wrap break-words">{note}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

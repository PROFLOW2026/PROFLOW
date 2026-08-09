'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  acceptApMatchAction,
  proposeApMatchAction,
  rejectApMatchAction,
  type ApFormState,
} from '../actions';

const NONE = 'none';

export function ProposeMatchForm({
  billId,
  currency,
  defaultAmount,
  purchaseOrders,
  expenses,
}: {
  billId: string;
  currency: string;
  defaultAmount: string;
  purchaseOrders: readonly { id: string; label: string }[];
  expenses: readonly { id: string; label: string }[];
}) {
  const t = useTranslations('ap.match');
  const [state, action, pending] = useActionState<ApFormState, FormData>(proposeApMatchAction, {});

  return (
    <form action={action} className="flex max-w-lg flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
      <h2 className="font-medium">{t('proposeTitle')}</h2>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('hint')}</p>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success ? (
        <Alert tone="success" role="status">
          {t('proposed')}
        </Alert>
      ) : null}

      <input type="hidden" name="apBillId" value={billId} />
      <input type="hidden" name="currency" value={currency} />

      <Field label={t('poLabel')}>
        {(props) => (
          <Select name="purchaseOrderId" defaultValue={NONE}>
            <SelectTrigger id={props.id}>
              <SelectValue placeholder={t('none')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('none')}</SelectItem>
              {purchaseOrders.map((po) => (
                <SelectItem key={po.id} value={po.id}>
                  {po.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('expenseLabel')}>
        {(props) => (
          <Select name="expenseId" defaultValue={NONE}>
            <SelectTrigger id={props.id}>
              <SelectValue placeholder={t('none')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('none')}</SelectItem>
              {expenses.map((expense) => (
                <SelectItem key={expense.id} value={expense.id}>
                  {expense.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('amountLabel')} required>
        {(props) => (
          <Input {...props} name="matchedAmount" defaultValue={defaultAmount} dir="ltr" required />
        )}
      </Field>

      <Field label={t('notesLabel')}>
        {(props) => <Textarea {...props} name="notes" rows={2} />}
      </Field>

      <Button type="submit" loading={pending}>
        {t('propose')}
      </Button>
    </form>
  );
}

export function MatchDecisionButtons({
  matchId,
  billId,
}: {
  matchId: string;
  billId: string;
}) {
  const t = useTranslations('ap.match');
  const [acceptState, acceptAction, acceptPending] = useActionState<ApFormState, FormData>(
    acceptApMatchAction,
    {},
  );
  const [rejectState, rejectAction, rejectPending] = useActionState<ApFormState, FormData>(
    rejectApMatchAction,
    {},
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {acceptState.error || rejectState.error ? (
        <Alert tone="danger">{acceptState.error || rejectState.error}</Alert>
      ) : null}
      <form action={acceptAction}>
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="apBillId" value={billId} />
        <Button type="submit" size="sm" loading={acceptPending}>
          {t('accept')}
        </Button>
      </form>
      <form action={rejectAction}>
        <input type="hidden" name="matchId" value={matchId} />
        <input type="hidden" name="apBillId" value={billId} />
        <Button type="submit" size="sm" variant="secondary" loading={rejectPending}>
          {t('reject')}
        </Button>
      </form>
    </div>
  );
}

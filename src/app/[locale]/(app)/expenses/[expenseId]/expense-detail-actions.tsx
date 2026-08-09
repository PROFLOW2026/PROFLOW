'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { MoneyText } from '@/components/patterns/money-text';
import type { BusinessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import type { MoneyValue } from '@/shared/money/money';
import { finalizeExpenseAction, voidExpenseAction } from '../actions';

export interface ExpenseDetailActionsProps {
  readonly expenseId: string;
  readonly status: 'draft' | 'finalized' | 'void';
  readonly canFinalize: boolean;
  readonly canVoid: boolean;
  readonly amount: MoneyValue;
  readonly expenseDate: BusinessDate;
}

function FormattedDate({ date, locale }: { date: BusinessDate; locale: string }) {
  return (
    <span dir="ltr" className="pf-numeric inline-block">
      {formatBusinessDate(date, locale)}
    </span>
  );
}

export function ExpenseDetailActions({
  expenseId,
  status,
  canFinalize,
  canVoid,
  amount,
  expenseDate,
}: ExpenseDetailActionsProps) {
  const t = useTranslations('expenses');
  const locale = useLocale();

  if (status !== 'draft' && !canVoid) return null;

  const moneyAndDate = {
    amount: () => <MoneyText value={amount} />,
    date: () => <FormattedDate date={expenseDate} locale={locale} />,
  };

  return (
    <div className="flex flex-wrap gap-2">
      {canFinalize ? (
        <ConfirmAction
          title={t('confirm.finalizeTitle')}
          description={
            <>
              <p>{t.rich('confirm.finalizeQuestion', moneyAndDate)}</p>
              <p>{t('confirm.finalizeConsequence')}</p>
            </>
          }
          confirmLabel={t('actions.finalize')}
          successMessage={t('confirm.finalizeSuccess')}
          onConfirm={() => finalizeExpenseAction(expenseId)}
          trigger={
            <Button type="button">
              {t('actions.finalize')}
            </Button>
          }
        />
      ) : null}

      {canVoid ? (
        <ConfirmAction
          title={t('confirm.voidTitle')}
          description={
            <>
              <p>{t.rich('confirm.voidQuestion', moneyAndDate)}</p>
              <p>{t('confirm.voidConsequence')}</p>
            </>
          }
          confirmLabel={t('actions.void')}
          successMessage={t('confirm.voidSuccess')}
          onConfirm={() => voidExpenseAction(expenseId)}
          trigger={
            <Button type="button" variant="secondary">
              {t('actions.void')}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

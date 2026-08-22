'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { MoneyText } from '@/components/patterns/money-text';
import { isBrowserOnline } from '@/modules/offline';
import type { CostCategoryRow, ExpenseDetail, ProjectOption } from '@/modules/expenses/domain/types';
import type { BusinessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import type { MoneyValue } from '@/shared/money/money';
import { finalizeExpenseAction, reverseExpenseAction, voidExpenseAction } from '../actions';
import { ExpenseCorrectDialog } from './expense-correct-dialog';

export interface ExpenseDetailActionsProps {
  readonly expenseId: string;
  readonly status: 'draft' | 'finalized' | 'void';
  readonly canFinalize: boolean;
  readonly canVoid: boolean;
  readonly canReverse?: boolean;
  readonly canCorrect?: boolean;
  readonly expense?: ExpenseDetail;
  readonly projects?: readonly ProjectOption[];
  readonly categories?: readonly CostCategoryRow[];
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
  canReverse = false,
  canCorrect = false,
  expense,
  projects = [],
  categories = [],
  amount,
  expenseDate,
}: ExpenseDetailActionsProps) {
  const t = useTranslations('expenses');
  const tOffline = useTranslations('offline');
  const locale = useLocale();
  const [offlineFinalizeError, setOfflineFinalizeError] = useState<string | null>(null);

  if (status !== 'draft' && !canVoid && !canReverse && !canCorrect) return null;

  const moneyAndDate = {
    amount: () => <MoneyText value={amount} />,
    date: () => <FormattedDate date={expenseDate} locale={locale} />,
  };

  return (
    <div className="flex flex-col gap-2">
      {offlineFinalizeError ? (
        <p role="alert" className="text-sm text-[var(--pf-status-warning-fg)]">
          {offlineFinalizeError}
        </p>
      ) : null}

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
            onConfirm={async () => {
              if (!isBrowserOnline()) {
                setOfflineFinalizeError(tOffline('forms.finalizeRequiresOnline'));
                return { error: tOffline('forms.finalizeRequiresOnline') };
              }
              setOfflineFinalizeError(null);
              return finalizeExpenseAction(expenseId);
            }}
            trigger={<Button type="button">{t('actions.finalize')}</Button>}
          />
        ) : null}

        {canCorrect && expense ? (
          <ExpenseCorrectDialog expense={expense} projects={projects} categories={categories} />
        ) : null}

        {canReverse ? (
          <ConfirmAction
            title={t('confirm.reverseTitle')}
            description={
              <>
                <p>{t.rich('confirm.reverseQuestion', moneyAndDate)}</p>
                <p>{t('confirm.reverseConsequence')}</p>
              </>
            }
            confirmLabel={t('actions.reverse')}
            successMessage={t('confirm.reverseSuccess')}
            onConfirm={() => reverseExpenseAction(expenseId)}
            trigger={
              <Button type="button" variant="secondary">
                {t('actions.reverse')}
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
    </div>
  );
}

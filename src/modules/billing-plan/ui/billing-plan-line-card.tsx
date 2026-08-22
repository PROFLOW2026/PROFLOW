'use client';

import { useTranslations } from 'next-intl';
import { formatMoneyAmountForInput, MoneyInput } from '@/components/patterns/money-input';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  deriveAmountFromPercent,
  derivePercentFromAmount,
} from '@/modules/billing-plan/domain/line-math';
import { money, toNumericString } from '@/shared/money';

export interface BillingPlanLineDraft {
  readonly id: string;
  readonly label: string;
  readonly agreedAmount: string;
  readonly agreedPercent: string;
  readonly billedAmount: string;
  readonly billedPercent: string;
  readonly remainingAmount: string;
  readonly retentionPercent: string;
}

interface BillingPlanLineCardProps {
  readonly line: BillingPlanLineDraft;
  /** Contract (or plan) base used for % ↔ amount. */
  readonly contractBaseAmount: string;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly canManage: boolean;
  readonly onChange: (patch: Partial<BillingPlanLineDraft>) => void;
  readonly onSave: () => void;
  readonly onRemove: () => void;
  readonly onDuplicate: () => void;
  readonly onMoveUp?: () => void;
  readonly onMoveDown?: () => void;
  readonly pending?: boolean;
}

export function BillingPlanLineCard({
  line,
  contractBaseAmount,
  currency,
  currencySymbol,
  canManage,
  onChange,
  onSave,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  pending,
}: BillingPlanLineCardProps) {
  const t = useTranslations('billingPlan');

  function onPercent(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || !contractBaseAmount || contractBaseAmount === '0') {
      onChange({ agreedPercent: trimmed });
      return;
    }
    try {
      const amount = toNumericString(
        deriveAmountFromPercent(money(contractBaseAmount, currency), trimmed),
      );
      onChange({ agreedPercent: trimmed, agreedAmount: amount });
    } catch {
      onChange({ agreedPercent: trimmed });
    }
  }

  function onAmount(raw: string) {
    if (!contractBaseAmount || contractBaseAmount === '0') {
      onChange({ agreedAmount: raw });
      return;
    }
    try {
      const pct = derivePercentFromAmount(
        money(contractBaseAmount, currency),
        money(raw || '0', currency),
      );
      onChange({ agreedAmount: raw, agreedPercent: pct });
    } catch {
      onChange({ agreedAmount: raw });
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
      <Field label={t('lines.label')}>
        {(control) => (
          <Input
            {...control}
            value={line.label}
            disabled={!canManage}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('lines.agreedPercent')}>
          {(control) => (
            <Input
              {...control}
              inputMode="decimal"
              dir="ltr"
              value={formatMoneyAmountForInput(line.agreedPercent || '')}
              disabled={!canManage}
              onChange={(e) => onPercent(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('lines.base')}>
          {(control) => (
            <MoneyInput
              {...control}
              value={formatMoneyAmountForInput(line.agreedAmount, currency)}
              currency={currency}
              currencySymbol={currencySymbol}
              disabled={!canManage}
              onValueChange={onAmount}
            />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.priorAmount')}</p>
          <p dir="ltr">{formatMoneyAmountForInput(line.billedAmount, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('lines.remaining')}</p>
          <p dir="ltr">{formatMoneyAmountForInput(line.remainingAmount, currency)}</p>
        </div>
      </div>

      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onSave} loading={pending}>
            {t('actions.saveLines')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onDuplicate} disabled={pending}>
            {t('actions.duplicate')}
          </Button>
          {onMoveUp ? (
            <Button type="button" size="sm" variant="ghost" onClick={onMoveUp} disabled={pending}>
              {t('lines.moveUp')}
            </Button>
          ) : null}
          {onMoveDown ? (
            <Button type="button" size="sm" variant="ghost" onClick={onMoveDown} disabled={pending}>
              {t('lines.moveDown')}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="danger" onClick={onRemove} disabled={pending}>
            {t('actions.removeLine')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

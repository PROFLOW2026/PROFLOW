'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FormActionState } from '@/app/[locale]/(app)/changes/actions';
import { fromNumericString } from '@/shared/money/money';
import { signedChangeAmount } from '../domain/contract-value';
import type { ChangeRequestDetail } from '../domain/types';

export interface ApproveChangeFormProps {
  detail: ChangeRequestDetail;
  action: (state: FormActionState, formData: FormData) => Promise<FormActionState>;
  canApprove: boolean;
}

export function ApproveChangeForm({ detail, action, canApprove }: ApproveChangeFormProps) {
  const t = useTranslations('changes.approve');
  const [state, formAction, pending] = useActionState(action, {});

  const selectedVersion = detail.quoteVersions.find((version) => version.isSelected);
  // Preview net commercial impact (VAT ≠ profit) — matches approval write path.
  const raw = selectedVersion?.subtotalAmount ?? detail.requestedAmount;
  const magnitude = raw ? fromNumericString(raw, detail.currency) : null;
  const signed = magnitude ? signedChangeAmount(detail.direction, magnitude) : null;

  return (
    <div className="flex max-w-xl flex-col gap-6">
      {signed ? (
        <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('amountLabel')}</p>
          <MoneyText value={signed} className="text-xl font-semibold" colorizeNegative />
          {selectedVersion ? (
            <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
              {t('versionLabel', { version: selectedVersion.versionNumber })}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-[var(--pf-status-warning-fg)]">{t('noAmount')}</p>
      )}

      {canApprove ? (
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="changeRequestId" value={detail.id} />
          {selectedVersion ? (
            <input type="hidden" name="quoteVersionId" value={selectedVersion.id} />
          ) : null}

          <Field label={t('approverName')} description={t('approverNameHint')}>
            {(control) => <Input {...control} name="approverName" />}
          </Field>

          <Field label={t('effectiveDate')} required>
            {(control) => <Input {...control} name="effectiveDate" type="date" required />}
          </Field>

          <Field label={t('notes')}>
            {(control) => <Textarea {...control} name="notes" rows={2} />}
          </Field>

          {state.error ? (
            <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
              {state.error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending || !signed}>
            {t('confirm')}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('noPermission')}</p>
      )}
    </div>
  );
}

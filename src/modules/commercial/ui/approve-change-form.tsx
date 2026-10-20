'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
  // Preview net commercial impact (VAT ≠ profit) - matches approval write path.
  const raw = selectedVersion?.subtotalAmount ?? detail.requestedAmount;
  const magnitude = raw ? fromNumericString(raw, detail.currency) : null;
  const signed = magnitude ? signedChangeAmount(detail.direction, magnitude) : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
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
        <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
          <input type="hidden" name="changeRequestId" value={detail.id} />
          {selectedVersion ? (
            <input type="hidden" name="quoteVersionId" value={selectedVersion.id} />
          ) : null}

          <MainAppFormGrid dense>
            <Field label={t('approverName')} description={t('approverNameHint')} className={mainAppFieldSpan.lg}>
              {(control) => <Input {...control} name="approverName" />}
            </Field>

            <Field label={t('effectiveDate')} required className={mainAppFieldSpan.md}>
              {(control) => <Input {...control} name="effectiveDate" type="date" required dir="ltr" />}
            </Field>

            <Field label={t('notes')} className={mainAppFieldSpan.full}>
              {(control) => <Textarea {...control} name="notes" rows={2} />}
            </Field>
          </MainAppFormGrid>

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

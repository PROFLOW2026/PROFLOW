'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { promoteExpenseVendorAction, type ExpenseActionState } from '../actions';

export interface PromoteVendorPanelProps {
  readonly expenseId: string;
  readonly supplierName: string;
}

/**
 * Progressive upgrade: plain supplier name → structured Vendor (doc 07 §2).
 */
export function PromoteVendorPanel({ expenseId, supplierName }: PromoteVendorPanelProps) {
  const t = useTranslations('expenses.promoteVendor');
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(
    promoteExpenseVendorAction,
    {},
  );

  if (state.ok) {
    return (
      <Alert tone="success">{t('success')}</Alert>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-start">{t('title')}</CardTitle>
        <CardDescription className="break-words text-start">
          {t('description', { name: supplierName })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex min-w-0 flex-col gap-3">
          <input type="hidden" name="expenseId" value={expenseId} />
          <input type="hidden" name="supplierName" value={supplierName} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <Button type="submit" variant="secondary" loading={pending}>
            {t('cta')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

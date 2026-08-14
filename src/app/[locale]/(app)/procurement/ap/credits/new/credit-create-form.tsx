'use client';

import { useMemo, useState, useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
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
import { createVendorCreditAction, type ApFormState } from '../../actions';

const NONE = '__none__';

export function VendorCreditCreateForm({
  defaultCurrency,
  defaultCreditDate,
  vendors,
  projects,
  bills,
}: {
  defaultCurrency: string;
  defaultCreditDate: string;
  vendors: readonly { id: string; name: string }[];
  projects: readonly { id: string; name: string }[];
  bills: readonly {
    id: string;
    vendorId: string;
    reference: string | null;
    status: string;
  }[];
}) {
  const t = useTranslations('ap.credits');
  const tCreate = useTranslations('ap.credits.createPage');
  const [state, formAction, pending] = useActionState<ApFormState, FormData>(
    createVendorCreditAction,
    {},
  );
  const [vendorId, setVendorId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [apBillId, setApBillId] = useState('');
  const [amount, setAmount] = useState('');

  const vendorBills = useMemo(
    () => bills.filter((bill) => bill.vendorId === vendorId),
    [bills, vendorId],
  );

  return (
    <form action={formAction} className="flex w-full min-w-0 max-w-2xl flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <input type="hidden" name="currency" value={defaultCurrency} />
      <input type="hidden" name="vendorId" value={vendorId} />
      <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
      <input type="hidden" name="apBillId" value={apBillId === NONE ? '' : apBillId} />
      <input type="hidden" name="amount" value={amount} />

      <Field label={tCreate('vendorLabel')} required>
        {(props) => (
          <Select
            value={vendorId || undefined}
            onValueChange={(value) => {
              setVendorId(value);
              setApBillId('');
            }}
          >
            <SelectTrigger {...props}>
              <SelectValue placeholder={tCreate('vendorPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={tCreate('projectLabel')}>
        {(props) => (
          <Select value={projectId || NONE} onValueChange={setProjectId}>
            <SelectTrigger {...props}>
              <SelectValue placeholder={tCreate('projectNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{tCreate('projectNone')}</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={tCreate('relatedBillLabel')}>
        {(props) => (
          <Select value={apBillId || NONE} onValueChange={setApBillId} disabled={!vendorId}>
            <SelectTrigger {...props}>
              <SelectValue placeholder={tCreate('relatedBillNone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{tCreate('relatedBillNone')}</SelectItem>
              {vendorBills.map((bill) => (
                <SelectItem key={bill.id} value={bill.id}>
                  {bill.reference?.trim() || bill.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label={t('amountLabel')} required>
        {(controlProps) => (
          <MoneyInput {...controlProps} required value={amount} onValueChange={setAmount} />
        )}
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="amountIncludesTax" defaultChecked className="mt-1" />
        <span>
          <span className="font-medium">{tCreate('amountIncludesTax')}</span>
          <span className="mt-0.5 block text-[var(--pf-text-secondary)]">{tCreate('taxSplitHint')}</span>
        </span>
      </label>
      <p className="text-xs text-[var(--pf-text-muted)]">{tCreate('actualVsPayableHint')}</p>

      <Field label={t('creditDateLabel')} required>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="creditDate"
            type="date"
            defaultValue={defaultCreditDate}
            required
            dir="ltr"
          />
        )}
      </Field>

      <Field label={t('referenceLabel')}>
        {(controlProps) => <Input {...controlProps} name="reference" maxLength={120} />}
      </Field>

      <Field label={t('notesLabel')}>
        {(controlProps) => <Textarea {...controlProps} name="notes" rows={3} />}
      </Field>

      <p className="text-xs text-[var(--pf-text-muted)]">{t('notPaymentNote')}</p>

      <Button type="submit" disabled={pending || !vendorId || !amount} size="lg" className="sm:w-auto">
        {pending ? t('pending') : tCreate('submit')}
      </Button>
    </form>
  );
}

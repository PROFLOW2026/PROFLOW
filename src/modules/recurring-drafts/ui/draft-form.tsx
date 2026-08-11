'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { DraftKind, DraftFrequency, StoredDraftPayload } from '../domain/types';
import { DRAFT_FREQUENCIES } from '../domain/types';

const NONE = '__none__';

export interface RecurringDraftFormState {
  readonly error?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly success?: boolean;
}

export interface RecurringDraftFormOption {
  readonly id: string;
  readonly name: string;
}

export function RecurringDraftForm({
  mode,
  action,
  defaultCurrency,
  defaultNextRunDate,
  writableKinds,
  vendors,
  projects,
  initial,
}: {
  mode: 'create' | 'edit';
  action: (prev: RecurringDraftFormState, formData: FormData) => Promise<RecurringDraftFormState>;
  defaultCurrency: string;
  defaultNextRunDate: string;
  writableKinds: readonly DraftKind[];
  vendors: readonly RecurringDraftFormOption[];
  projects: readonly RecurringDraftFormOption[];
  initial?: {
    readonly draftId?: string;
    readonly title: string;
    readonly draftKind: DraftKind;
    readonly frequency: DraftFrequency;
    readonly intervalCount: number;
    readonly nextRunDate: string;
    readonly endDate: string | null;
    readonly payload?: StoredDraftPayload;
  };
}) {
  const t = useTranslations('recurringDrafts');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState(action, {} as RecurringDraftFormState);

  const initialKind = initial?.draftKind ?? writableKinds[0] ?? 'expense';
  const [kind, setKind] = useState<DraftKind>(initialKind);
  const [frequency, setFrequency] = useState<DraftFrequency>(initial?.frequency ?? 'monthly');
  const [projectId, setProjectId] = useState(payloadString(initial?.payload, 'projectId') || NONE);
  const [vendorId, setVendorId] = useState(payloadString(initial?.payload, 'vendorId') || '');
  const [amount, setAmount] = useState(initialAmount(initial?.payload, defaultCurrency).amount);
  const [currency, setCurrency] = useState(
    initialAmount(initial?.payload, defaultCurrency).currency,
  );

  const kinds = mode === 'edit' ? [initialKind] : writableKinds;

  return (
    <form action={formAction} className="mx-auto flex w-full max-w-lg flex-col gap-5">
      {initial?.draftId ? <input type="hidden" name="draftId" value={initial.draftId} /> : null}
      {mode === 'edit' ? <input type="hidden" name="draftKind" value={initialKind} /> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <Field label={t('fields.title')} required error={state.fieldErrors?.title}>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="title"
            required
            maxLength={200}
            defaultValue={initial?.title ?? ''}
          />
        )}
      </Field>

      <Field label={t('fields.kind')} required>
        {(controlProps) =>
          mode === 'edit' ? (
            <Input {...controlProps} value={t(`kind.${initialKind}`)} readOnly />
          ) : (
            <>
              <Select name="draftKind" value={kind} onValueChange={(value) => setKind(value as DraftKind)}>
                <SelectTrigger {...controlProps}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`kind.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="draftKind" value={kind} />
            </>
          )
        }
      </Field>

      <Field label={t('fields.frequency')} required>
        {(controlProps) => (
          <>
            <input type="hidden" name="frequency" value={frequency} />
            <Select value={frequency} onValueChange={(value) => setFrequency(value as DraftFrequency)}>
              <SelectTrigger {...controlProps}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRAFT_FREQUENCIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`frequency.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Field>

      <Field label={t('fields.intervalCount')} required>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="intervalCount"
            type="number"
            min={1}
            max={52}
            defaultValue={String(initial?.intervalCount ?? 1)}
            dir="ltr"
          />
        )}
      </Field>

      <Field label={t('fields.nextRunDate')} required error={state.fieldErrors?.nextRunDate}>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="nextRunDate"
            type="date"
            required
            defaultValue={initial?.nextRunDate ?? defaultNextRunDate}
            dir="ltr"
          />
        )}
      </Field>

      <Field label={t('fields.endDate')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="endDate"
            type="date"
            defaultValue={initial?.endDate ?? ''}
            dir="ltr"
          />
        )}
      </Field>

      <Field label={t('fields.amount')} required error={state.fieldErrors?.amount}>
        {(controlProps) => (
          <>
            <MoneyInput {...controlProps} value={amount} onValueChange={setAmount} required />
            <input type="hidden" name="amount" value={amount} />
          </>
        )}
      </Field>

      <Field label={t('fields.currency')} required>
        {(controlProps) => (
          <Input
            {...controlProps}
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            maxLength={3}
            dir="ltr"
            required
          />
        )}
      </Field>

      {kind === 'expense' ? (
        <>
          <Field label={t('fields.description')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="description"
                maxLength={2000}
                defaultValue={payloadString(initial?.payload, 'description')}
              />
            )}
          </Field>
          <Field label={t('fields.supplierName')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="supplierName"
                maxLength={500}
                defaultValue={payloadString(initial?.payload, 'supplierName')}
              />
            )}
          </Field>
          <Field label={t('fields.project')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <>
                <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('fields.overhead')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('fields.overhead')}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
        </>
      ) : null}

      {kind === 'vendor_bill' ? (
        <>
          <Field label={t('fields.vendor')} required error={state.fieldErrors?.vendorId}>
            {(controlProps) => (
              <>
                <input type="hidden" name="vendorId" value={vendorId} />
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('fields.vendor')} />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
          <Field label={t('fields.lineDescription')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="lineDescription"
                maxLength={500}
                defaultValue={vendorLineDescription(initial?.payload)}
              />
            )}
          </Field>
          <Field label={t('fields.reference')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="reference"
                maxLength={80}
                defaultValue={payloadString(initial?.payload, 'reference')}
              />
            )}
          </Field>
          <Field label={t('fields.project')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <>
                <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('fields.none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t('fields.none')}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
          <Field label={t('fields.dueDays')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="dueDays"
                type="number"
                min={0}
                max={365}
                defaultValue={payloadNumber(initial?.payload, 'dueDays')}
                dir="ltr"
              />
            )}
          </Field>
        </>
      ) : null}

      {kind === 'billing_record' ? (
        <>
          <Field label={t('fields.project')} required error={state.fieldErrors?.projectId}>
            {(controlProps) => (
              <>
                <input type="hidden" name="projectId" value={projectId === NONE ? '' : projectId} />
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger {...controlProps}>
                    <SelectValue placeholder={t('fields.project')} />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
          <Field label={t('fields.reference')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="reference"
                maxLength={120}
                defaultValue={payloadString(initial?.payload, 'reference')}
              />
            )}
          </Field>
          <Field label={t('fields.dueDays')} optionalLabel={tCommon('labels.optional')}>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="dueDays"
                type="number"
                min={0}
                max={365}
                defaultValue={payloadNumber(initial?.payload, 'dueDays')}
                dir="ltr"
              />
            )}
          </Field>
        </>
      ) : null}

      <Field label={t('fields.notes')} optionalLabel={tCommon('labels.optional')}>
        {(controlProps) => (
          <Textarea
            {...controlProps}
            name="notes"
            rows={3}
            defaultValue={payloadString(initial?.payload, 'notes')}
          />
        )}
      </Field>

      <Button type="submit" disabled={pending} className="min-h-11 w-full sm:w-auto">
        {pending
          ? tCommon('states.saving')
          : mode === 'edit'
            ? t('edit.submit')
            : t('create.submit')}
      </Button>
    </form>
  );
}

function initialAmount(
  payload: StoredDraftPayload | undefined,
  fallbackCurrency: string,
): { amount: string; currency: string } {
  if (!payload) return { amount: '', currency: fallbackCurrency };
  if (payload.kind === 'expense') {
    return { amount: payload.data.amount, currency: payload.data.currency || fallbackCurrency };
  }
  if (payload.kind === 'vendor_bill') {
    return {
      amount: payload.data.totalAmount,
      currency: payload.data.currency || fallbackCurrency,
    };
  }
  return {
    amount: payload.data.amount,
    currency: payload.data.currency || fallbackCurrency,
  };
}

function payloadString(payload: StoredDraftPayload | undefined, key: string): string {
  if (!payload) return '';
  const value = (payload.data as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function payloadNumber(payload: StoredDraftPayload | undefined, key: string): string {
  if (!payload) return '';
  const value = (payload.data as Record<string, unknown>)[key];
  return typeof value === 'number' ? String(value) : '';
}

function vendorLineDescription(payload: StoredDraftPayload | undefined): string {
  if (!payload || payload.kind !== 'vendor_bill') return '';
  return payload.data.lines[0]?.description ?? '';
}


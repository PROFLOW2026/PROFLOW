'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { QuoteStatus } from '@/modules/quotes/domain/types';
import { convertQuoteAction, transitionQuoteAction, type QuotesFormState } from '../actions';

export function QuoteDetailActions({
  quoteId,
  status,
  title,
  canManage,
}: {
  quoteId: string;
  status: QuoteStatus;
  title: string;
  canManage: boolean;
}) {
  const t = useTranslations('quotes.detail');
  const [transitionState, transitionAction, transitionPending] = useActionState<
    QuotesFormState,
    FormData
  >(transitionQuoteAction, {});
  const [convertState, convertAction, convertPending] = useActionState<QuotesFormState, FormData>(
    convertQuoteAction,
    {},
  );
  const [workKind, setWorkKind] = useState<'project' | 'job' | 'work_order'>('project');
  const [pricingMode, setPricingMode] = useState<'fixed' | 'open'>('fixed');

  if (!canManage) return null;

  const transitions: { to: QuoteStatus; label: string }[] = [];
  if (status === 'draft') {
    transitions.push({ to: 'ready', label: t('markReady') }, { to: 'sent', label: t('markSent') }, {
      to: 'cancelled',
      label: t('cancel'),
    });
  }
  if (status === 'ready') {
    transitions.push(
      { to: 'draft', label: t('backToDraft') },
      { to: 'sent', label: t('markSent') },
      { to: 'cancelled', label: t('cancel') },
    );
  }
  if (status === 'sent') {
    transitions.push(
      { to: 'accepted', label: t('accept') },
      { to: 'rejected', label: t('reject') },
      { to: 'expired', label: t('expire') },
      { to: 'cancelled', label: t('cancel') },
    );
  }

  return (
    <div className="flex flex-col gap-4 print:hidden">
      {transitionState.error ? <Alert tone="danger">{transitionState.error}</Alert> : null}
      {convertState.error ? <Alert tone="danger">{convertState.error}</Alert> : null}

      {transitions.length > 0 ? (
        <div className="flex flex-col gap-2">
          {status === 'draft' || status === 'ready' ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('markSentHint')}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {transitions.map((item) => (
              <form key={item.to} action={transitionAction}>
                <input type="hidden" name="quoteId" value={quoteId} />
                <input type="hidden" name="toStatus" value={item.to} />
                <Button type="submit" variant="secondary" size="sm" disabled={transitionPending}>
                  {item.label}
                </Button>
              </form>
            ))}
          </div>
        </div>
      ) : null}

      {status === 'accepted' ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <div>
            <h2 className="font-semibold">{t('convert')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('convertHint')}</p>
          </div>
          <form action={convertAction} className="flex max-w-md flex-col gap-3">
            <input type="hidden" name="quoteId" value={quoteId} />
            <Field label={t('projectName')}>
              {(control) => <Input {...control} name="projectName" defaultValue={title} />}
            </Field>
            <Field label={t('workKind')}>
              {(control) => (
                <>
                  <input type="hidden" name="workKind" value={workKind} />
                  <Select
                    value={workKind}
                    onValueChange={(v) => setWorkKind(v as 'project' | 'job' | 'work_order')}
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="project">{t('workKindProject')}</SelectItem>
                      <SelectItem value="job">{t('workKindJob')}</SelectItem>
                      <SelectItem value="work_order">{t('workKindWorkOrder')}</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>
            {workKind === 'job' || workKind === 'work_order' ? (
              <Field label={t('pricingMode')}>
                {(control) => (
                  <>
                    <input type="hidden" name="pricingMode" value={pricingMode} />
                    <Select
                      value={pricingMode}
                      onValueChange={(v) => setPricingMode(v as 'fixed' | 'open')}
                    >
                      <SelectTrigger id={control.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">{t('pricingFixed')}</SelectItem>
                        <SelectItem value="open">{t('pricingOpen')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}
              </Field>
            ) : null}
            <Button type="submit" disabled={convertPending}>
              {t('convertSubmit')}
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  );
}

export function QuotePrintButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}

'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
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
import { QUOTE_TAX_MODES, type QuoteTaxMode } from '@/modules/quotes/domain/types';
import {
  createQuoteAction,
  updateQuoteAction,
  type QuotesFormState,
} from '@/app/[locale]/(app)/quotes/actions';
import {
  QuoteTextBlocksEditor,
  type QuoteTextBlockDraft,
} from '@/modules/quotes/ui/quote-text-blocks-editor';
import { formatDecimalInputSeed } from '@/shared/number/display';

export interface QuoteEditorLine {
  description: string;
  quantity: string;
  unit: string;
  unitPriceAmount: string;
  estimatedUnitCostAmount: string;
}

const emptyLine = (): QuoteEditorLine => ({
  description: '',
  quantity: '1',
  unit: '',
  unitPriceAmount: '',
  estimatedUnitCostAmount: '',
});

export function QuoteEditorForm({
  mode,
  quoteId,
  opportunityId,
  defaultCurrency,
  defaultTitle,
  defaultClientId,
  defaultDescription,
  defaultTaxMode = 'exclusive',
  defaultValidityDate,
  defaultNotes,
  defaultDiscountAmount,
  defaultListSubtotalAmount,
  defaultDiscountPercent,
  defaultLines,
  defaultTextBlocks,
  clients,
}: {
  mode: 'create' | 'edit';
  quoteId?: string;
  opportunityId?: string | null;
  defaultCurrency: string;
  defaultTitle?: string;
  defaultClientId?: string | null;
  defaultDescription?: string | null;
  defaultTaxMode?: QuoteTaxMode;
  defaultValidityDate?: string | null;
  defaultNotes?: string | null;
  defaultDiscountAmount?: string | null;
  defaultListSubtotalAmount?: string | null;
  defaultDiscountPercent?: string | null;
  defaultLines?: readonly QuoteEditorLine[];
  defaultTextBlocks?: readonly QuoteTextBlockDraft[];
  clients: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('quotes.create');
  const tTax = useTranslations('quotes.taxModes');
  const tCommon = useTranslations('common');
  const action = mode === 'edit' ? updateQuoteAction : createQuoteAction;
  const [state, formAction, pending] = useActionState<QuotesFormState, FormData>(action, {});
  const [clientId, setClientId] = useState(defaultClientId ?? '__none__');
  const [taxMode, setTaxMode] = useState<QuoteTaxMode>(defaultTaxMode);
  const [lines, setLines] = useState<QuoteEditorLine[]>(
    defaultLines && defaultLines.length > 0
      ? defaultLines.map((line) => ({
          ...line,
          quantity: formatDecimalInputSeed(line.quantity) || line.quantity,
          unitPriceAmount: formatDecimalInputSeed(line.unitPriceAmount) || line.unitPriceAmount,
          estimatedUnitCostAmount:
            formatDecimalInputSeed(line.estimatedUnitCostAmount) || line.estimatedUnitCostAmount,
        }))
      : [emptyLine()],
  );

  return (
    <form
      action={formAction}
      data-testid={mode === 'edit' ? 'quote-edit-form' : 'quote-create-form'}
      className="flex w-full min-w-0 flex-col gap-4"
    >
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.success && mode === 'edit' ? (
        <Alert tone="success">{t('saved')}</Alert>
      ) : null}
      {opportunityId ? <input type="hidden" name="opportunityId" value={opportunityId} /> : null}
      {mode === 'edit' && quoteId ? <input type="hidden" name="quoteId" value={quoteId} /> : null}
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('profitHint')}</p>

      <MainAppFormGrid dense>
        <Field
          label={t('titleLabel')}
          required
          error={state.fieldErrors?.title}
          className={mainAppFieldSpan.lg}
        >
          {(control) => (
            <Input {...control} name="title" required autoFocus defaultValue={defaultTitle ?? ''} />
          )}
        </Field>

        {mode === 'create' ? (
          <Field
            label={t('referenceLabel')}
            optionalLabel={tCommon('labels.optional')}
            description={t('referenceHint')}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <Input {...control} name="reference" autoComplete="off" dir="ltr" className="pf-ltr-island" />
            )}
          </Field>
        ) : null}

        <Field label={t('clientLabel')} className={mainAppFieldSpan.lg}>
          {(control) => (
            <>
              <input type="hidden" name="clientId" value={clientId} />
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('clientNone')}</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>

        <Field label={t('descriptionLabel')} className={mainAppFieldSpan.full}>
          {(control) => (
            <Textarea {...control} name="description" rows={3} defaultValue={defaultDescription ?? ''} />
          )}
        </Field>

        <Field label={t('currencyLabel')} className={mainAppFieldSpan.md}>
          {(control) => (
            <Input {...control} name="currency" defaultValue={defaultCurrency} dir="ltr" maxLength={3} />
          )}
        </Field>
        <Field label={t('taxModeLabel')} className={mainAppFieldSpan.lg}>
          {(control) => (
            <>
              <input type="hidden" name="taxMode" value={taxMode} />
              <Select value={taxMode} onValueChange={(v) => setTaxMode(v as QuoteTaxMode)}>
                <SelectTrigger id={control.id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUOTE_TAX_MODES.map((modeOption) => (
                    <SelectItem key={modeOption} value={modeOption}>
                      {tTax(modeOption)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>

        <Field label={t('validityLabel')} className={mainAppFieldSpan.lg}>
          {(control) => (
            <Input
              {...control}
              name="validityDate"
              type="date"
              dir="ltr"
              defaultValue={defaultValidityDate ?? ''}
            />
          )}
        </Field>

        <Field
          label={t('discountAmountLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => (
            <Input
              {...control}
              name="discountAmount"
              inputMode="decimal"
              dir="ltr"
              defaultValue={formatDecimalInputSeed(defaultDiscountAmount) || (defaultDiscountAmount ?? '')}
            />
          )}
        </Field>
        <Field
          label={t('listSubtotalLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => (
            <Input
              {...control}
              name="listSubtotalAmount"
              inputMode="decimal"
              dir="ltr"
              defaultValue={formatDecimalInputSeed(defaultListSubtotalAmount) || (defaultListSubtotalAmount ?? '')}
            />
          )}
        </Field>
        <Field
          label={t('discountPercentLabel')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => (
            <Input
              {...control}
              name="discountPercent"
              inputMode="decimal"
              dir="ltr"
              defaultValue={formatDecimalInputSeed(defaultDiscountPercent) || (defaultDiscountPercent ?? '')}
            />
          )}
        </Field>
      </MainAppFormGrid>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('discountHint')}</p>

      <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t('linesTitle')}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            {t('addLine')}
          </Button>
        </div>
        <input type="hidden" name="lineCount" value={lines.length} />
        {lines.map((line, index) => (
          <div key={index} className="flex flex-col gap-2 border-t border-[var(--pf-border-default)] pt-3">
            <MainAppFormGrid dense>
              <Field label={t('lineDescription')} required className={mainAppFieldSpan.full}>
                {(control) => (
                  <Input
                    {...control}
                    name={`line.${index}.description`}
                    value={line.description}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, description: e.target.value } : row,
                        ),
                      )
                    }
                    required
                  />
                )}
              </Field>
              <Field label={t('quantity')} className={mainAppFieldSpan.lg}>
                {(control) => (
                  <Input
                    {...control}
                    name={`line.${index}.quantity`}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, quantity: e.target.value } : row,
                        ),
                      )
                    }
                    inputMode="decimal"
                    dir="ltr"
                  />
                )}
              </Field>
              <Field label={t('unit')} className={mainAppFieldSpan.lg}>
                {(control) => (
                  <Input
                    {...control}
                    name={`line.${index}.unit`}
                    value={line.unit}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, unit: e.target.value } : row)),
                      )
                    }
                  />
                )}
              </Field>
              <Field label={t('unitPrice')} required className={mainAppFieldSpan.lg}>
                {(control) => (
                  <Input
                    {...control}
                    name={`line.${index}.unitPriceAmount`}
                    value={line.unitPriceAmount}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index ? { ...row, unitPriceAmount: e.target.value } : row,
                        ),
                      )
                    }
                    inputMode="decimal"
                    dir="ltr"
                    required
                  />
                )}
              </Field>
              <Field label={t('unitCost')} className={mainAppFieldSpan.lg}>
                {(control) => (
                  <Input
                    {...control}
                    name={`line.${index}.estimatedUnitCostAmount`}
                    value={line.estimatedUnitCostAmount}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === index
                            ? { ...row, estimatedUnitCostAmount: e.target.value }
                            : row,
                        ),
                      )
                    }
                    inputMode="decimal"
                    dir="ltr"
                  />
                )}
              </Field>
            </MainAppFormGrid>
            {lines.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                {t('removeLine')}
              </Button>
            ) : null}
          </div>
        ))}
      </section>

      <QuoteTextBlocksEditor
        initialBlocks={
          defaultTextBlocks ??
          []
        }
      />

      <MainAppFormGrid dense>
        <Field label={t('notesLabel')} className={mainAppFieldSpan.full}>
          {(control) => (
            <Textarea {...control} name="notes" rows={2} defaultValue={defaultNotes ?? ''} />
          )}
        </Field>
      </MainAppFormGrid>

      <div className="flex w-full min-w-0 gap-2">
        <Button type="submit" className="w-full min-w-0 sm:w-auto" disabled={pending}>
          {pending ? tCommon('actions.saving') : mode === 'edit' ? t('saveDraft') : t('submit')}
        </Button>
      </div>
    </form>
  );
}

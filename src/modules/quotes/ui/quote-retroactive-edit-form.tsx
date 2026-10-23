'use client';

import { useActionState, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import {
  editQuoteRetroactiveAction,
  type QuotesFormState,
} from '@/app/[locale]/(app)/quotes/actions';

interface QuoteRetroactiveEditFormProps {
  readonly quoteId: string;
  readonly initialTitle: string;
  readonly initialDescription: string | null;
  readonly initialValidityDate: string | null;
  readonly initialNotes: string | null;
  readonly locale: string;
}

export function QuoteRetroactiveEditForm({
  quoteId,
  initialTitle,
  initialDescription,
  initialValidityDate,
  initialNotes,
  locale,
}: QuoteRetroactiveEditFormProps) {
  const t = useTranslations('quotes.retroactiveEdit');
  const tCommon = useTranslations('common');

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? '');
  const [validityDate, setValidityDate] = useState(initialValidityDate ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [state, formAction, pending] = useActionState<QuotesFormState, FormData>(
    editQuoteRetroactiveAction.bind(null, quoteId),
    {},
  );

  const changeDiffs = useMemo((): BusinessChangeFieldDiff[] => {
    const rows: BusinessChangeFieldDiff[] = [];
    if (title.trim() !== initialTitle.trim()) {
      rows.push({ fieldLabel: t('fields.title'), before: initialTitle, after: title.trim() });
    }
    const descBefore = (initialDescription ?? '').trim() || '—';
    const descAfter = description.trim() || '—';
    if (descAfter !== descBefore) {
      rows.push({ fieldLabel: t('fields.description'), before: descBefore, after: descAfter });
    }
    const validityBefore = initialValidityDate
      ? formatBusinessDate(businessDate(initialValidityDate), locale)
      : '—';
    const validityAfter = validityDate.trim()
      ? formatBusinessDate(businessDate(validityDate.trim()), locale)
      : '—';
    if (validityAfter !== validityBefore) {
      rows.push({ fieldLabel: t('fields.validityDate'), before: validityBefore, after: validityAfter });
    }
    const notesBefore = (initialNotes ?? '').trim() || '—';
    const notesAfter = notes.trim() || '—';
    if (notesAfter !== notesBefore) {
      rows.push({ fieldLabel: t('fields.notes'), before: notesBefore, after: notesAfter });
    }
    return rows;
  }, [
    description,
    initialDescription,
    initialNotes,
    initialTitle,
    initialValidityDate,
    locale,
    notes,
    t,
    title,
    validityDate,
  ]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (changeDiffs.length === 0) return;
    event.preventDefault();
    setConfirmOpen(true);
  }

  function confirmSave() {
    setConfirmOpen(false);
    const form = document.getElementById(`quote-retro-form-${quoteId}`) as HTMLFormElement | null;
    const ack = form?.querySelector<HTMLInputElement>('input[name="changeAcknowledged"]');
    if (ack) ack.value = 'true';
    form?.requestSubmit();
  }

  return (
    <>
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-start">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.success ? (
            <Alert tone="success" className="mb-4">
              {t('saved')}
            </Alert>
          ) : null}
          <form
            id={`quote-retro-form-${quoteId}`}
            action={formAction}
            onSubmit={handleSubmit}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="changeAcknowledged" value="false" />
            <MainAppFormGrid>
              <Field label={t('fields.title')} className={mainAppFieldSpan.full}>
                {(control) => (
                  <Input
                    {...control}
                    name="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('fields.description')} className={mainAppFieldSpan.full}>
                {(control) => (
                  <Textarea
                    {...control}
                    name="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                )}
              </Field>
              <Field label={t('fields.validityDate')} className={mainAppFieldSpan.md}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="validityDate"
                    value={validityDate}
                    onChange={(e) => setValidityDate(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t('fields.notes')} className={mainAppFieldSpan.full}>
                {(control) => (
                  <Textarea
                    {...control}
                    name="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                )}
              </Field>
            </MainAppFormGrid>
            <Button type="submit" loading={pending} disabled={changeDiffs.length === 0}>
              {pending ? tCommon('actions.saving') : t('save')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('confirmTitle')}
        description={t('confirmDescription')}
        changes={changeDiffs}
        pending={pending}
        onConfirm={confirmSave}
        onBackToEdit={() => setConfirmOpen(false)}
      />
    </>
  );
}

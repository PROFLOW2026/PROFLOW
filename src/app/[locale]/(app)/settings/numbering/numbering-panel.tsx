'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type {
  DocumentNumberKind,
  DocumentNumberSequenceRecord,
} from '@/modules/tenancy/domain/document-numbers';
import { defaultDocumentNumberSequence } from '@/modules/tenancy/domain/document-numbers';
import { saveDocumentNumberSettingsAction, type SettingsActionState } from '../actions';

const KIND_ORDER: readonly DocumentNumberKind[] = [
  'project',
  'job',
  'work_order',
  'estimate',
  'purchase_order',
  'vendor_bill',
  'billing_record',
  'change_request',
  'change_order',
];

export function NumberingSettingsPanel({
  sequences,
  canEdit,
}: {
  sequences: readonly DocumentNumberSequenceRecord[];
  canEdit: boolean;
}) {
  const t = useTranslations('settings.numbering');
  const [state, action, pending] = useActionState(
    saveDocumentNumberSettingsAction,
    {} as SettingsActionState,
  );
  const byKind = new Map(sequences.map((sequence) => [sequence.documentKind, sequence]));

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      <Alert tone="warning">{t('legalDisclaimer')}</Alert>
      <p className="text-start text-xs text-[var(--pf-text-muted)]">{t('commercialNote')}</p>

      <form action={action} className="flex flex-col gap-4">
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? (
          <Alert tone="success" role="status" aria-live="polite">
            {t('saved')}
          </Alert>
        ) : null}

        <ul className="flex flex-col gap-4">
          {KIND_ORDER.map((kind) => {
            const sequence = byKind.get(kind) ?? defaultDocumentNumberSequence('', kind);
            return (
              <li
                key={kind}
                className="rounded-lg border border-[var(--pf-border-default)] p-4"
              >
                <input type="hidden" name={`kind.${kind}`} value={kind} />
                <h3 className="text-sm font-semibold">{t(`kinds.${kind}`)}</h3>
                {kind === 'change_request' || kind === 'change_order' ? (
                  <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('perProjectNote')}</p>
                ) : null}
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field label={t('prefix')}>
                    {(props) => (
                      <Input
                        {...props}
                        name={`prefix.${kind}`}
                        defaultValue={sequence.prefix}
                        maxLength={20}
                        disabled={!canEdit}
                        dir="ltr"
                        className="pf-ltr-island"
                      />
                    )}
                  </Field>
                  <Field label={t('padding')}>
                    {(props) => (
                      <Input
                        {...props}
                        name={`padding.${kind}`}
                        type="number"
                        min={1}
                        max={8}
                        numeric
                        defaultValue={String(sequence.padding)}
                        disabled={!canEdit}
                        required
                      />
                    )}
                  </Field>
                  <Field label={t('nextNumber')}>
                    {(props) => (
                      <Input
                        {...props}
                        name={`nextNumber.${kind}`}
                        type="number"
                        min={1}
                        numeric
                        defaultValue={String(sequence.nextNumber)}
                        disabled={!canEdit}
                        required
                      />
                    )}
                  </Field>
                </div>
              </li>
            );
          })}
        </ul>

        {canEdit ? (
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? t('saving') : t('save')}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

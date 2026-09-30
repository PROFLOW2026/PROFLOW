'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { QuoteDefaultTextBlockRecord } from '@/modules/quotes/domain/text-blocks';
import {
  deleteQuoteSettingsBlockAction,
  saveQuoteSettingsBlockAction,
  type QuoteSettingsFormState,
} from './actions';

export function QuoteSettingsPanel({
  blocks: initialBlocks,
  canEdit,
}: {
  blocks: readonly QuoteDefaultTextBlockRecord[];
  canEdit: boolean;
}) {
  const t = useTranslations('quotes.settings');
  const tCommon = useTranslations('common');
  const [blocks] = useState([...initialBlocks]);
  const [saveState, saveAction, savePending] = useActionState<
    QuoteSettingsFormState,
    FormData
  >(saveQuoteSettingsBlockAction, {});
  const [deleteState, deleteAction, deletePending] = useActionState<
    QuoteSettingsFormState,
    FormData
  >(deleteQuoteSettingsBlockAction, {});

  const [draft, setDraft] = useState<{
    blockId?: string;
    title: string;
    body: string;
    enabled: boolean;
    sortOrder: number;
  } | null>(null);

  function startNew() {
    const nextOrder =
      blocks.length > 0 ? Math.max(...blocks.map((b) => b.sortOrder)) + 10 : 0;
    setDraft({ title: '', body: '', enabled: true, sortOrder: nextOrder });
  }

  function startEdit(block: QuoteDefaultTextBlockRecord) {
    setDraft({
      blockId: block.id,
      title: block.title,
      body: block.body,
      enabled: block.enabled,
      sortOrder: block.sortOrder,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}
      {deleteState.error ? <Alert tone="danger">{deleteState.error}</Alert> : null}
      {saveState.success ? <Alert tone="success">{t('saved')}</Alert> : null}

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('intro')}</p>

      <ul className="flex flex-col gap-3">
        {blocks.map((block) => (
          <li
            key={block.id}
            className="rounded-lg border border-[var(--pf-border-default)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{block.title}</p>
                <p className="text-xs text-[var(--pf-text-muted)]">
                  {block.enabled ? t('enabled') : t('disabled')} · {t('order')}{' '}
                  {block.sortOrder}
                </p>
              </div>
              {canEdit ? (
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(block)}>
                    {t('editBlock')}
                  </Button>
                  <form action={deleteAction}>
                    <input type="hidden" name="blockId" value={block.id} />
                    <Button type="submit" variant="ghost" size="sm" disabled={deletePending}>
                      {t('deleteBlock')}
                    </Button>
                  </form>
                </div>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-[var(--pf-text-secondary)]">
              {block.body}
            </p>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div className="flex flex-col gap-4">
          {!draft ? (
            <Button type="button" onClick={startNew}>
              {t('addBlock')}
            </Button>
          ) : (
            <form action={saveAction} className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
              {draft.blockId ? <input type="hidden" name="blockId" value={draft.blockId} /> : null}
              <input type="hidden" name="sortOrder" value={draft.sortOrder} />
              <Field label={t('blockTitle')} required>
                {(control) => (
                  <Input
                    {...control}
                    name="title"
                    required
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                )}
              </Field>
              <Field label={t('blockBody')} required>
                {(control) => (
                  <Textarea
                    {...control}
                    name="body"
                    required
                    rows={8}
                    value={draft.body}
                    onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                  value="true"
                />
                {t('blockEnabled')}
              </label>
              {!draft.enabled ? <input type="hidden" name="enabled" value="false" /> : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={savePending}>
                  {t('saveBlock')}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  {tCommon('actions.cancel')}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}

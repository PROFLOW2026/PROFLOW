'use client';

import { Plus } from 'lucide-react';
import { useActionState, useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { QuoteDefaultTextBlockRecord } from '@/modules/quotes/domain/text-blocks';
import {
  deleteQuoteSettingsBlockAction,
  reorderQuoteSettingsBlockAction,
  saveQuoteSettingsBlockAction,
  toggleQuoteSettingsBlockAction,
  type QuoteSettingsFormState,
} from './actions';

type BlockDraft = {
  blockId?: string;
  title: string;
  body: string;
  enabled: boolean;
  sortOrder: number;
};

export function QuoteSettingsPanel({
  blocks: initialBlocks,
  canEdit,
}: {
  blocks: readonly QuoteDefaultTextBlockRecord[];
  canEdit: boolean;
}) {
  const t = useTranslations('quotes.settings');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<BlockDraft | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const saveBlock = useCallback(
    async (prev: QuoteSettingsFormState, formData: FormData) => {
      const result = await saveQuoteSettingsBlockAction(prev, formData);
      if (result.success) {
        setEditorOpen(false);
        setDraft(null);
        router.refresh();
      }
      return result;
    },
    [router],
  );

  const [saveState, saveAction, savePending] = useActionState<
    QuoteSettingsFormState,
    FormData
  >(saveBlock, {});

  const sortedBlocks = [...initialBlocks].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'he'),
  );

  function openNewBlock() {
    const nextOrder =
      sortedBlocks.length > 0
        ? Math.max(...sortedBlocks.map((block) => block.sortOrder)) + 10
        : 0;
    setDraft({ title: '', body: '', enabled: true, sortOrder: nextOrder });
    setEditorOpen(true);
  }

  function openEditBlock(block: QuoteDefaultTextBlockRecord) {
    setDraft({
      blockId: block.id,
      title: block.title,
      body: block.body,
      enabled: block.enabled,
      sortOrder: block.sortOrder,
    });
    setEditorOpen(true);
  }

  function runBlockAction(action: () => Promise<QuoteSettingsFormState>) {
    setActionError(null);
    startTransition(() => {
      void action().then((result) => {
        if (result.error) {
          setActionError(result.error);
          return;
        }
        router.refresh();
      });
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {saveState.error ? <Alert tone="danger">{saveState.error}</Alert> : null}
      {actionError ? <Alert tone="danger">{actionError}</Alert> : null}
      {saveState.success ? <Alert tone="success">{t('saved')}</Alert> : null}

      {canEdit ? (
        <div>
          <Button type="button" className="w-fit gap-1.5" onClick={openNewBlock}>
            <Plus className="size-4" aria-hidden />
            {t('addBlock')}
          </Button>
        </div>
      ) : null}

      {sortedBlocks.length === 0 ? (
        <EmptyState
          title={t('emptyBlocks')}
          className="min-w-0"
          action={
            canEdit ? (
              <Button type="button" className="w-fit gap-1.5" onClick={openNewBlock}>
                <Plus className="size-4" aria-hidden />
                {t('addBlock')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {sortedBlocks.map((block, index) => (
            <li
              key={block.id}
              className="min-w-0 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
            >
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-start">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium break-words">{block.title}</p>
                    <Badge tone={block.enabled ? 'success' : 'neutral'}>
                      {block.enabled ? t('enabled') : t('disabled')}
                    </Badge>
                  </div>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[var(--pf-text-secondary)]">
                {block.body}
              </p>

              {canEdit ? (
                <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openEditBlock(block)}
                  >
                    {t('editBlock')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending || index === 0}
                    aria-label={t('moveUp')}
                    onClick={() =>
                      runBlockAction(() => reorderQuoteSettingsBlockAction(block.id, 'up'))
                    }
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending || index === sortedBlocks.length - 1}
                    aria-label={t('moveDown')}
                    onClick={() =>
                      runBlockAction(() => reorderQuoteSettingsBlockAction(block.id, 'down'))
                    }
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      runBlockAction(() =>
                        toggleQuoteSettingsBlockAction(block.id, !block.enabled),
                      )
                    }
                  >
                    {block.enabled ? t('disableBlock') : t('enableBlock')}
                  </Button>
                  <ConfirmAction
                    title={t('deleteBlock')}
                    description={<p>{t('deleteConfirm', { title: block.title })}</p>}
                    confirmLabel={t('deleteBlock')}
                    successMessage={t('saved')}
                    onConfirm={async () => {
                      const formData = new FormData();
                      formData.set('blockId', block.id);
                      const result = await deleteQuoteSettingsBlockAction({}, formData);
                      if (result.error) return { error: result.error };
                      router.refresh();
                      return { ok: true };
                    }}
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        {t('deleteBlock')}
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[min(90vh,720px)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.blockId ? t('editBlock') : t('addBlock')}</DialogTitle>
          </DialogHeader>
          {draft ? (
            <form action={saveAction} className="flex flex-col gap-3">
              {draft.blockId ? <input type="hidden" name="blockId" value={draft.blockId} /> : null}
              <input type="hidden" name="sortOrder" value={draft.sortOrder} />
              <Field label={t('blockTitle')} required>
                {(control) => (
                  <Input
                    {...control}
                    name="title"
                    required
                    value={draft.title}
                    onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t('blockBody')} required>
                {(control) => (
                  <Textarea
                    {...control}
                    name="body"
                    required
                    rows={10}
                    className="min-h-[12rem] w-full max-w-full"
                    value={draft.body}
                    onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  />
                )}
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  checked={draft.enabled}
                  onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
                  value="true"
                />
                {t('blockEnabled')}
              </label>
              {!draft.enabled ? <input type="hidden" name="enabled" value="false" /> : null}
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="submit" disabled={savePending}>
                  {t('saveBlock')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditorOpen(false);
                    setDraft(null);
                  }}
                >
                  {tCommon('actions.cancel')}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

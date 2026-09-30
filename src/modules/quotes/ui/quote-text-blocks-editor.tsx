'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface QuoteTextBlockDraft {
  title: string;
  body: string;
  enabled: boolean;
  sortOrder: number;
}

export function QuoteTextBlocksEditor({
  initialBlocks,
}: {
  initialBlocks: readonly QuoteTextBlockDraft[];
}) {
  const t = useTranslations('quotes.create');
  const tDetail = useTranslations('quotes.detail');
  const [blocks, setBlocks] = useState<QuoteTextBlockDraft[]>([...initialBlocks]);

  function updateBlock(index: number, patch: Partial<QuoteTextBlockDraft>) {
    setBlocks((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addBlock() {
    const nextOrder =
      blocks.length > 0 ? Math.max(...blocks.map((b) => b.sortOrder)) + 10 : 0;
    setBlocks((prev) => [
      ...prev,
      { title: '', body: '', enabled: true, sortOrder: nextOrder },
    ]);
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <section className="flex flex-col gap-3">
      <input type="hidden" name="textBlockCount" value={blocks.length} />
      <h2 className="text-base font-semibold">{tDetail('textBlocksTitle')}</h2>
      {blocks.map((block, index) => (
        <div
          key={`block-${index}`}
          className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3"
        >
          <input type="hidden" name={`textBlock.${index}.sortOrder`} value={block.sortOrder} />
          <input
            type="hidden"
            name={`textBlock.${index}.enabled`}
            value={block.enabled ? 'true' : 'false'}
          />
          <Field label={t('lineDescription')}>
            {(control) => (
              <Input
                {...control}
                name={`textBlock.${index}.title`}
                value={block.title}
                onChange={(e) => updateBlock(index, { title: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('descriptionLabel')}>
            {(control) => (
              <Textarea
                {...control}
                name={`textBlock.${index}.body`}
                rows={4}
                value={block.body}
                onChange={(e) => updateBlock(index, { body: e.target.value })}
              />
            )}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.enabled}
              onChange={(e) => updateBlock(index, { enabled: e.target.checked })}
            />
            {tDetail('textBlocksTitle')}
          </label>
          <Button type="button" variant="ghost" size="sm" onClick={() => removeBlock(index)}>
            {t('removeLine')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={addBlock}>
        {t('addLine')}
      </Button>
    </section>
  );
}

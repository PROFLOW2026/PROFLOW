'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { askAssistantAction, type AssistantFormState } from './actions';
import type { AssistantCitation, AssistantMessageRecord } from '@/modules/assistant/domain/types';
import { Link } from '@/shared/i18n/navigation';

export function AssistantChat({
  conversationId,
  messages,
  providerConfigured,
}: {
  conversationId: string | null;
  messages: readonly AssistantMessageRecord[];
  providerConfigured: boolean;
}) {
  const t = useTranslations('assistant');
  const [state, action, pending] = useActionState<AssistantFormState, FormData>(askAssistantAction, {});

  return (
    <div className="flex flex-col gap-4">
      {!providerConfigured ? <Alert tone="info">{t('unconfigured')}</Alert> : null}
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('disclaimer')}</p>
      <div className="flex min-h-40 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
        {messages.length === 0 && !state.content ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
        ) : null}
        {messages.map((message) => (
          <article key={message.id} className="text-sm">
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.citations.length > 0 ? (
              <Citations citations={message.citations} label={t('citations')} />
            ) : null}
          </article>
        ))}
        {state.content ? <p className="whitespace-pre-wrap text-sm">{state.content}</p> : null}
        {state.error === 'failed' ? <Alert tone="danger">{t('errors.noProvider')}</Alert> : null}
      </div>
      <form action={action} className="flex flex-col gap-2">
        {conversationId || state.conversationId ? (
          <input
            type="hidden"
            name="conversationId"
            value={state.conversationId ?? conversationId ?? ''}
          />
        ) : null}
        <Textarea name="question" rows={3} placeholder={t('placeholder')} required />
        <Button type="submit" disabled={pending}>
          {t('send')}
        </Button>
      </form>
    </div>
  );
}

function Citations({
  citations,
  label,
}: {
  citations: readonly AssistantCitation[];
  label: string;
}) {
  return (
    <p className="mt-2 text-xs text-[var(--pf-text-muted)]">
      {label}:{' '}
      {citations.map((citation, index) =>
        citation.href ? (
          <Link key={`${citation.label}-${index}`} href={citation.href} className="underline">
            {citation.label}
            {index < citations.length - 1 ? ', ' : ''}
          </Link>
        ) : (
          <span key={`${citation.label}-${index}`}>
            {citation.label}
            {index < citations.length - 1 ? ', ' : ''}
          </span>
        ),
      )}
    </p>
  );
}

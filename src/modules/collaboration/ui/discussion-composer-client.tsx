'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CollabActionState } from '../shared/action-state.types';

type DiscussionFormAction = (state: CollabActionState, formData: FormData) => Promise<CollabActionState>;

export function DiscussionComposerClient({
  action,
  hidden,
  submitLabel,
  allowAudience,
  allowDecision,
  defaultAudience = 'internal',
  audienceLabels,
}: {
  readonly action: DiscussionFormAction;
  readonly hidden: Readonly<Record<string, string>>;
  readonly submitLabel: string;
  readonly allowAudience: boolean;
  readonly allowDecision: boolean;
  readonly defaultAudience?: 'internal' | 'contractor';
  readonly audienceLabels: {
    readonly internal: string;
    readonly contractor: string;
    readonly kindComment: string;
    readonly kindDecision: string;
  };
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.nonce, state.success]);

  return (
    <form ref={formRef} action={formAction} className="flex min-w-0 flex-col gap-3">
      {Object.entries(hidden).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      {allowAudience ? (
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="audience" value="internal" defaultChecked={defaultAudience === 'internal'} />
            <span>{audienceLabels.internal}</span>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="audience" value="contractor" defaultChecked={defaultAudience === 'contractor'} />
            <span>{audienceLabels.contractor}</span>
          </label>
        </div>
      ) : null}
      {allowDecision ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="collab-kind">{audienceLabels.kindComment}</Label>
          <select id="collab-kind" name="kind" className="min-h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm">
            <option value="comment">{audienceLabels.kindComment}</option>
            <option value="decision">{audienceLabels.kindDecision}</option>
          </select>
        </div>
      ) : null}
      <Textarea name="body" required minLength={1} maxLength={8000} rows={3} className="min-h-[5rem] resize-y" />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.fieldErrors
        ? Object.values(state.fieldErrors).map((message) => (
            <Alert key={message} tone="danger">
              {message}
            </Alert>
          ))
        : null}
      <Button type="submit" variant="primary" size="sm" disabled={pending} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

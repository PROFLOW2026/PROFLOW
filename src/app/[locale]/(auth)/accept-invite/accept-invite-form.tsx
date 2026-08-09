'use client';

import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { acceptInviteAction, type AcceptInviteState } from './actions';

/**
 * Joining happens on submit, never on page load: a link scanner or a browser
 * prefetch must not be able to spend somebody's invitation.
 */
export function AcceptInviteForm({ token, submitLabel }: { token: string; submitLabel: string }) {
  const [state, formAction, pending] = useActionState<AcceptInviteState, FormData>(
    acceptInviteAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

'use client';

import { useCallback, useState, useTransition } from 'react';
import { useOptionalToast } from '@/components/ui/toast';
import type { StructureActionResult } from './types';

export interface StructureActionState {
  readonly pending: boolean;
  readonly error: string | null;
  readonly fieldErrors: Record<string, string>;
  readonly status: string | null;
}

/**
 * Runs a structure server action in a transition, surfaces the localized error inline and
 * a success toast (or inline status when no toast provider is mounted).
 */
export function useStructureAction() {
  const toast = useOptionalToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  const run = useCallback(
    <P,>(
      action: (payload: P) => Promise<StructureActionResult>,
      payload: P,
      successMessage: (result: Extract<StructureActionResult, { ok: true }>) => string,
      onSuccess?: () => void,
    ) => {
      setError(null);
      setFieldErrors({});
      setStatus(null);
      startTransition(async () => {
        const result = await action(payload);
        if (result.ok) {
          const message = successMessage(result);
          if (toast) toast.push(message, 'success');
          else setStatus(message);
          onSuccess?.();
          return;
        }
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      });
    },
    [toast],
  );

  const state: StructureActionState = { pending, error, fieldErrors, status };
  return { ...state, run };
}

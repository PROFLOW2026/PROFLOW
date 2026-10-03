'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import type { ExternalContext } from '@/shared/external';
import {
  createContractorRfi,
  submitContractorRfi,
  updateContractorRfi,
} from '../application/contractor-rfi';
import type { CreateExternalRfiInput, UpdateExternalRfiInput } from '../validation/schemas';
import { rfiActionError, type RfiActionResult } from './action-result';

type RunResult<T> = { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function runExternal<T>(fn: (context: ExternalContext) => Promise<T>): Promise<RunResult<T>> {
  try {
    const context = await requireExternalContext();
    const value = await fn(context);
    refresh();
    return { ok: true, value };
  } catch (error) {
    unstable_rethrow(error);
    return rfiActionError(error);
  }
}

export async function createContractorRfiAction(
  input: CreateExternalRfiInput,
): Promise<RfiActionResult<{ rfiId: string }>> {
  const result = await runExternal((context) => createContractorRfi(context, input));
  return result.ok ? { ok: true, data: { rfiId: result.value.rfiId } } : result;
}

export async function updateContractorRfiAction(input: UpdateExternalRfiInput): Promise<RfiActionResult> {
  const result = await runExternal((context) => updateContractorRfi(context, input));
  return result.ok ? { ok: true } : result;
}

export async function submitContractorRfiAction(input: {
  organizationId: string;
  rfiId: string;
}): Promise<RfiActionResult> {
  const result = await runExternal((context) => submitContractorRfi(context, input));
  return result.ok ? { ok: true } : result;
}

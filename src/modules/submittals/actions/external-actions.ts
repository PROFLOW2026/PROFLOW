'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import type { ExternalContext } from '@/shared/external';
import {
  createContractorSubmittal,
  openContractorRevision,
  submitContractorSubmittal,
  updateContractorRevisionNotes,
  updateContractorSubmittal,
  withdrawContractorSubmittal,
} from '../application/contractor-submittals';
import type { CreateExternalSubmittalInput, UpdateExternalSubmittalInput } from '../validation/schemas';
import { submittalActionError, type SubmittalActionResult } from './action-result';

type RunResult<T> = { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function runExternal<T>(fn: (context: ExternalContext) => Promise<T>): Promise<RunResult<T>> {
  try {
    const context = await requireExternalContext();
    const value = await fn(context);
    refresh();
    return { ok: true, value };
  } catch (error) {
    unstable_rethrow(error);
    return submittalActionError(error);
  }
}

export async function createContractorSubmittalAction(
  input: CreateExternalSubmittalInput,
): Promise<SubmittalActionResult<{ submittalId: string }>> {
  const result = await runExternal((context) => createContractorSubmittal(context, input));
  return result.ok ? { ok: true, data: { submittalId: result.value.submittalId } } : result;
}

export async function updateContractorSubmittalAction(input: UpdateExternalSubmittalInput): Promise<SubmittalActionResult> {
  const result = await runExternal((context) => updateContractorSubmittal(context, input));
  return result.ok ? { ok: true } : result;
}

export async function updateContractorRevisionNotesAction(input: {
  organizationId: string;
  submittalId: string;
  notes: string | null;
}): Promise<SubmittalActionResult> {
  const result = await runExternal((context) => updateContractorRevisionNotes(context, input));
  return result.ok ? { ok: true } : result;
}

export async function submitContractorSubmittalAction(input: {
  organizationId: string;
  submittalId: string;
}): Promise<SubmittalActionResult> {
  const result = await runExternal((context) => submitContractorSubmittal(context, input));
  return result.ok ? { ok: true } : result;
}

export async function openContractorRevisionAction(input: {
  organizationId: string;
  submittalId: string;
}): Promise<SubmittalActionResult> {
  const result = await runExternal((context) => openContractorRevision(context, input));
  return result.ok ? { ok: true } : result;
}

export async function withdrawContractorSubmittalAction(input: {
  organizationId: string;
  submittalId: string;
}): Promise<SubmittalActionResult> {
  const result = await runExternal((context) => withdrawContractorSubmittal(context, input));
  return result.ok ? { ok: true } : result;
}

'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import type { OrgContext } from '@/shared/auth/context';
import { withOrgContext } from '@/shared/auth/session';
import {
  createSubmittal,
  openSubmittalRevision,
  reviewSubmittal,
  startSubmittalReview,
  submitSubmittal,
  updateSubmittal,
  updateSubmittalRevisionNotes,
  withdrawSubmittal,
} from '../application/internal-submittals';
import type {
  CreateInternalSubmittalInput,
  ReviewSubmittalInput,
  RevisionNotesInput,
  SubmittalActionInput,
  UpdateInternalSubmittalInput,
} from '../validation/schemas';
import { submittalActionError, type SubmittalActionResult } from './action-result';

type RunResult<T> = { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function run<T>(fn: (context: OrgContext) => Promise<T>): Promise<RunResult<T>> {
  try {
    const value = await withOrgContext(fn);
    refresh();
    return { ok: true, value };
  } catch (error) {
    unstable_rethrow(error);
    return submittalActionError(error);
  }
}

function done(result: RunResult<unknown>): SubmittalActionResult {
  return result.ok ? { ok: true } : result;
}

export async function createSubmittalAction(
  input: CreateInternalSubmittalInput,
): Promise<SubmittalActionResult<{ submittalId: string }>> {
  const result = await run((context) => createSubmittal(context, input));
  return result.ok ? { ok: true, data: { submittalId: result.value.submittalId } } : result;
}

export async function updateSubmittalAction(input: UpdateInternalSubmittalInput): Promise<SubmittalActionResult> {
  return done(await run((context) => updateSubmittal(context, input)));
}

export async function updateSubmittalRevisionNotesAction(input: RevisionNotesInput): Promise<SubmittalActionResult> {
  return done(await run((context) => updateSubmittalRevisionNotes(context, input)));
}

export async function submitSubmittalAction(input: SubmittalActionInput): Promise<SubmittalActionResult> {
  return done(await run((context) => submitSubmittal(context, input)));
}

export async function startSubmittalReviewAction(input: SubmittalActionInput): Promise<SubmittalActionResult> {
  return done(await run((context) => startSubmittalReview(context, input)));
}

export async function reviewSubmittalAction(input: ReviewSubmittalInput): Promise<SubmittalActionResult> {
  return done(await run((context) => reviewSubmittal(context, input)));
}

export async function openSubmittalRevisionAction(input: SubmittalActionInput): Promise<SubmittalActionResult> {
  return done(await run((context) => openSubmittalRevision(context, input)));
}

export async function withdrawSubmittalAction(input: SubmittalActionInput): Promise<SubmittalActionResult> {
  return done(await run((context) => withdrawSubmittal(context, input)));
}

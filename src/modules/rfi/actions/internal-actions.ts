'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import type { OrgContext } from '@/shared/auth/context';
import { withOrgContext } from '@/shared/auth/session';
import {
  answerRfi,
  closeRfi,
  createRfi,
  reopenRfi,
  startRfiReview,
  submitRfi,
  updateRfi,
} from '../application/internal-rfi';
import type {
  AnswerRfiInput,
  CreateInternalRfiInput,
  RfiTransitionInput,
  UpdateInternalRfiInput,
} from '../validation/schemas';
import { rfiActionError, type RfiActionResult } from './action-result';

type RunResult<T> = { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function run<T>(fn: (context: OrgContext) => Promise<T>): Promise<RunResult<T>> {
  try {
    const value = await withOrgContext(fn);
    refresh();
    return { ok: true, value };
  } catch (error) {
    unstable_rethrow(error);
    return rfiActionError(error);
  }
}

function done(result: RunResult<unknown>): RfiActionResult {
  return result.ok ? { ok: true } : result;
}

export async function createRfiAction(input: CreateInternalRfiInput): Promise<RfiActionResult<{ rfiId: string }>> {
  const result = await run((context) => createRfi(context, input));
  return result.ok ? { ok: true, data: { rfiId: result.value.rfiId } } : result;
}

export async function updateRfiAction(input: UpdateInternalRfiInput): Promise<RfiActionResult> {
  return done(await run((context) => updateRfi(context, input)));
}

export async function submitRfiAction(input: RfiTransitionInput): Promise<RfiActionResult> {
  return done(await run((context) => submitRfi(context, input)));
}

export async function startRfiReviewAction(input: RfiTransitionInput): Promise<RfiActionResult> {
  return done(await run((context) => startRfiReview(context, input)));
}

export async function answerRfiAction(input: AnswerRfiInput): Promise<RfiActionResult> {
  return done(await run((context) => answerRfi(context, input)));
}

export async function closeRfiAction(input: RfiTransitionInput): Promise<RfiActionResult> {
  return done(await run((context) => closeRfi(context, input)));
}

export async function reopenRfiAction(input: RfiTransitionInput): Promise<RfiActionResult> {
  return done(await run((context) => reopenRfi(context, input)));
}

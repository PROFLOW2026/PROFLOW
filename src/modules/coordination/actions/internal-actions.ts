'use server';

import { refresh } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import type { OrgContext } from '@/shared/auth/context';
import { withOrgContext } from '@/shared/auth/session';
import {
  createCoordinationEvent,
  createCoordinationFollowUpTask,
  dismissCoordinationIssue,
  inviteCoordinationParticipants,
  linkCoordinationDocument,
  overrideCoordinationReadiness,
  recordCoordinationOutcome,
  recordResponseOnBehalf,
  requestCoordinationReadiness,
  rescheduleCoordinationEvent,
  unlinkCoordinationDocument,
  updateCoordinationEventDetails,
  updateCoordinationParticipant,
} from '../application/manage-events';
import type {
  CreateCoordinationEventInput,
  CreateFollowUpTaskInput,
  InviteParticipantsInput,
  LinkDocumentInput,
  OverrideReadinessInput,
  RecordOutcomeInput,
  RequestReadinessInput,
  RescheduleEventInput,
  RespondToEventInput,
  UpdateCoordinationEventInput,
  UpdateParticipantInput,
} from '../validation/schemas';
import { coordinationActionError, type CoordinationActionResult } from './action-result';

/**
 * Internal coordination server actions. Every action re-resolves the OrgContext and the use-case
 * re-checks project capabilities (server actions are reachable by direct POST).
 */

type RunResult<T> = { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function run<T>(fn: (context: OrgContext) => Promise<T>): Promise<RunResult<T>> {
  try {
    const value = await withOrgContext(fn);
    refresh();
    return { ok: true, value };
  } catch (error) {
    unstable_rethrow(error);
    return coordinationActionError(error);
  }
}

function done<T>(result: RunResult<T>): CoordinationActionResult {
  return result.ok ? { ok: true } : result;
}

export async function createCoordinationEventAction(
  input: CreateCoordinationEventInput,
): Promise<CoordinationActionResult<{ eventId: string }>> {
  const result = await run((context) => createCoordinationEvent(context, input));
  return result.ok ? { ok: true, data: result.value } : result;
}

export async function updateCoordinationEventAction(input: UpdateCoordinationEventInput): Promise<CoordinationActionResult> {
  return done(await run((context) => updateCoordinationEventDetails(context, input)));
}

export async function inviteCoordinationParticipantsAction(input: InviteParticipantsInput): Promise<CoordinationActionResult> {
  return done(await run((context) => inviteCoordinationParticipants(context, input)));
}

export async function updateCoordinationParticipantAction(input: UpdateParticipantInput): Promise<CoordinationActionResult> {
  return done(await run((context) => updateCoordinationParticipant(context, input)));
}

export async function requestCoordinationReadinessAction(input: RequestReadinessInput): Promise<CoordinationActionResult> {
  return done(await run((context) => requestCoordinationReadiness(context, input)));
}

export async function recordResponseOnBehalfAction(input: RespondToEventInput): Promise<CoordinationActionResult> {
  return done(await run((context) => recordResponseOnBehalf(context, input)));
}

export async function createCoordinationFollowUpTaskAction(
  input: CreateFollowUpTaskInput,
): Promise<CoordinationActionResult<{ taskId: string }>> {
  const result = await run((context) => createCoordinationFollowUpTask(context, input));
  return result.ok ? { ok: true, data: { taskId: result.value.taskId } } : result;
}

export async function dismissCoordinationIssueAction(input: {
  projectId: string;
  eventId: string;
  issueId: string;
}): Promise<CoordinationActionResult> {
  return done(await run((context) => dismissCoordinationIssue(context, input)));
}

export async function overrideCoordinationReadinessAction(input: OverrideReadinessInput): Promise<CoordinationActionResult> {
  return done(await run((context) => overrideCoordinationReadiness(context, input)));
}

export async function rescheduleCoordinationEventAction(input: RescheduleEventInput): Promise<CoordinationActionResult> {
  return done(await run((context) => rescheduleCoordinationEvent(context, input)));
}

export async function recordCoordinationOutcomeAction(input: RecordOutcomeInput): Promise<CoordinationActionResult> {
  return done(await run((context) => recordCoordinationOutcome(context, input)));
}

export async function linkCoordinationDocumentAction(input: LinkDocumentInput): Promise<CoordinationActionResult> {
  return done(await run((context) => linkCoordinationDocument(context, input)));
}

export async function unlinkCoordinationDocumentAction(input: {
  projectId: string;
  eventId: string;
  linkId: string;
}): Promise<CoordinationActionResult> {
  return done(await run((context) => unlinkCoordinationDocument(context, input)));
}

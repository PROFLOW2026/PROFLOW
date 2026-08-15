import { ConflictError } from '@/shared/errors';

export interface DueRecurringDraftRef {
  readonly id: string;
  readonly organizationId: string;
  readonly locale: string;
}

export interface RecurringOpsRunResult {
  readonly scanned: number;
  readonly generated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly failures: readonly { readonly draftId: string; readonly error: string }[];
}

export function isAlreadyGeneratedTodayError(error: unknown): boolean {
  return (
    error instanceof ConflictError &&
    error.messageKey === 'recurringDrafts.errors.alreadyGeneratedToday'
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'unknown';
}

/**
 * Generate each due template independently. Conflict (already generated today)
 * counts as skipped, not failed. One template error never aborts the run.
 */
export async function runDueRecurringDrafts<TContext>(input: {
  readonly due: readonly DueRecurringDraftRef[];
  readonly findOwner: (organizationId: string) => Promise<{ readonly userId: string } | null>;
  readonly withActor: <T>(
    userId: string,
    organizationId: string,
    locale: string,
    fn: (context: TContext) => Promise<T>,
  ) => Promise<T>;
  readonly generate: (
    context: TContext,
    input: { readonly draftId: string },
  ) => Promise<unknown>;
}): Promise<RecurringOpsRunResult> {
  const ownerByOrg = new Map<string, { userId: string } | null>();
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { draftId: string; error: string }[] = [];

  for (const draft of input.due) {
    try {
      let owner = ownerByOrg.get(draft.organizationId);
      if (owner === undefined) {
        owner = await input.findOwner(draft.organizationId);
        ownerByOrg.set(draft.organizationId, owner);
      }
      if (!owner) {
        failed += 1;
        failures.push({ draftId: draft.id, error: 'no_org_owner' });
        continue;
      }

      await input.withActor(owner.userId, draft.organizationId, draft.locale, (context) =>
        input.generate(context, { draftId: draft.id }),
      );
      generated += 1;
    } catch (error) {
      if (isAlreadyGeneratedTodayError(error)) {
        skipped += 1;
        continue;
      }
      failed += 1;
      failures.push({ draftId: draft.id, error: errorMessage(error) });
    }
  }

  return { scanned: input.due.length, generated, skipped, failed, failures };
}

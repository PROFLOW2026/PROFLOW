import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@/shared/errors';
import { runDueRecurringDrafts } from '@/modules/recurring-drafts/domain/ops-run';

const DUE = {
  id: 'draft-1',
  organizationId: 'org-1',
  locale: 'en',
};

describe('recurring drafts ops worker', () => {
  it('treats already-generated-today as idempotent skip, not failure', async () => {
    const generate = vi.fn(async () => {
      throw new ConflictError(
        'A draft was already generated for this template today',
        'recurringDrafts.errors.alreadyGeneratedToday',
      );
    });

    const result = await runDueRecurringDrafts({
      due: [DUE],
      findOwner: async () => ({ userId: 'owner-1' }),
      withActor: async (_userId, _orgId, _locale, fn) => fn({} as never),
      generate,
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ scanned: 1, generated: 0, skipped: 1, failed: 0 });
    expect(result.failures).toEqual([]);
  });

  it('fails one template without aborting the rest', async () => {
    const generate = vi.fn(async (_ctx: unknown, input: { draftId: string }) => {
      if (input.draftId === 'draft-1') throw new Error('boom');
      return { draftId: input.draftId };
    });

    const result = await runDueRecurringDrafts({
      due: [DUE, { ...DUE, id: 'draft-2' }],
      findOwner: async () => ({ userId: 'owner-1' }),
      withActor: async (_userId, _orgId, _locale, fn) => fn({} as never),
      generate,
    });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.generated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([{ draftId: 'draft-1', error: 'boom' }]);
  });
});

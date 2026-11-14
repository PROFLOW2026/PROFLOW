/**
 * Sheet-mark ↔ BOQ link: org + project + active BOQ membership (BUG-013).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, NotFoundError } from '@/shared/errors';
import {
  assertBoqNodeInActiveProjectBoq,
  assertNoDuplicateBoqNodeLink,
} from '@/modules/project-plans/application/sheet-mark-boq-link';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const OTHER_PROJECT = '33333333-3333-4333-8333-333333333333';
const BOQ_NODE = '44444444-4444-4444-8444-444444444444';
const REVISION = '55555555-5555-4555-8555-555555555555';

const execute = vi.fn();
const db = { execute } as unknown as Parameters<typeof assertBoqNodeInActiveProjectBoq>[0];

beforeEach(() => {
  execute.mockReset();
});

describe('assertBoqNodeInActiveProjectBoq', () => {
  it('accepts a node on the active BOQ for the project', async () => {
    execute.mockResolvedValueOnce([{ id: BOQ_NODE }]);
    await expect(assertBoqNodeInActiveProjectBoq(db, ORG, PROJECT, BOQ_NODE)).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-project BOQ node (no membership row)', async () => {
    execute.mockResolvedValueOnce([]);
    await expect(assertBoqNodeInActiveProjectBoq(db, ORG, OTHER_PROJECT, BOQ_NODE)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects when the node is missing or not on an active BOQ', async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    await expect(assertBoqNodeInActiveProjectBoq(db, ORG, PROJECT, BOQ_NODE)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('assertNoDuplicateBoqNodeLink', () => {
  it('allows a first link and rejects a duplicate on the same revision', async () => {
    execute.mockResolvedValueOnce([]);
    await expect(assertNoDuplicateBoqNodeLink(db, ORG, REVISION, BOQ_NODE)).resolves.toBeUndefined();

    execute.mockResolvedValueOnce([{ id: 'mark-1' }]);
    await expect(assertNoDuplicateBoqNodeLink(db, ORG, REVISION, BOQ_NODE)).rejects.toBeInstanceOf(ConflictError);
  });
});

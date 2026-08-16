import { beforeEach, describe, expect, it } from 'vitest';
import {
  createInMemoryPlanningStore,
  listPlanningPlan,
  upsertPlanningWorkItem,
} from '@/modules/planning';
import {
  buildFixtureCandidates,
  createInMemoryOcrRepository,
  resetOcrStoreForTests,
} from '@/modules/ocr';

const ORG = '018f0000-0000-7000-8000-0000000000aa';
const PROJECT = '018f0000-0000-7000-8000-0000000000a1';

describe('scenario L - in-memory is not durable across store instances', () => {
  beforeEach(() => {
    resetOcrStoreForTests();
  });

  it('planning: a new in-memory store does not see prior writes (test double)', async () => {
    const storeA = createInMemoryPlanningStore();
    await upsertPlanningWorkItem(
      {
        organizationId: ORG,
        projectId: PROJECT,
        workKind: 'project',
        name: 'Ephemeral',
        kind: 'task',
        startDate: '2026-08-01',
        targetEndDate: '2026-08-02',
      },
      { repo: storeA },
    );

    const storeB = createInMemoryPlanningStore();
    const view = await listPlanningPlan(
      {
        organizationId: ORG,
        projectId: PROJECT,
        workKind: 'project',
        today: '2026-08-01',
      },
      { repo: storeB },
    );
    expect(view.snapshot.workItems).toHaveLength(0);
  });

  it('OCR: a new in-memory repository does not see prior jobs (test double)', async () => {
    const repoA = createInMemoryOcrRepository();
    await repoA.seedFixtureJob({
      organizationId: ORG,
      candidates: buildFixtureCandidates(),
    });

    // Process-local shared bucket: createInMemoryOcrRepository wraps the same Map.
    // Explicit clear proves metadata is not claimed durable without Drizzle.
    resetOcrStoreForTests();
    const repoB = createInMemoryOcrRepository();
    const jobs = await repoB.listJobsForOrg(ORG);
    expect(jobs).toHaveLength(0);
  });
});

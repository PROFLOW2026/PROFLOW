import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isCommercialProjectHomePath,
  isOwnerExecutionWorkspacePath,
} from '@/modules/project-workspace/domain/execution-workspace-path';
import { isOwnerProjectWorkWorkspacePath } from '@/modules/project-workspace/domain/project-work-workspace-path';
import { EXECUTION_HUBS } from '@/modules/project-workspace/domain/execution-hubs';

const PROJECT_ID = '02dd65ce-adbb-4cdf-8c2e-613832ecd622';

/** Product rule: UWM + meetings routes use ProjectWorkNav regardless of GC profile (path layer only). */
describe('multi-industry project workspace routing (path classification)', () => {
  const workRoutes = ['tasks', 'boards', 'calendar', 'timeline', 'site-meetings'] as const;

  it.each(workRoutes)('A–D — /%s resolves to project-work, not execution', (segment) => {
    const pathname = `/projects/${PROJECT_ID}/${segment}`;
    expect(isOwnerProjectWorkWorkspacePath(pathname, PROJECT_ID)).toBe(true);
    expect(isOwnerExecutionWorkspacePath(pathname, PROJECT_ID)).toBe(false);
  });

  it('E — non-GC trade project still uses project-work on /tasks (no execution collision)', () => {
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/tasks`, PROJECT_ID)).toBe(false);
  });

  it('C — developer/GC /execution stays execution workspace', () => {
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/execution`, PROJECT_ID)).toBe(true);
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/execution`, PROJECT_ID)).toBe(false);
  });

  it('F — /financials stays commercial shell (not operational work or execution)', () => {
    expect(isCommercialProjectHomePath(`/projects/${PROJECT_ID}/financials`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/financials`, PROJECT_ID)).toBe(false);
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/financials`, PROJECT_ID)).toBe(false);
  });

  it('G — six owner task nav destinations have route pages or commercial tab target', () => {
    const appRoot = join(process.cwd(), 'src/app/[locale]/(app)/projects/[projectId]');
    const segments = ['tasks', 'boards', 'calendar', 'timeline', 'site-meetings'] as const;
    for (const segment of segments) {
      expect(existsSync(join(appRoot, segment, 'page.tsx'))).toBe(true);
    }
    expect(existsSync(join(appRoot, 'page.tsx'))).toBe(true);
  });

  it('J — employee contractor-access page exists (no 404 target)', () => {
    const page = join(
      process.cwd(),
      'src/app/[locale]/employee/(shell)/projects/[projectId]/contractor-access/page.tsx',
    );
    expect(existsSync(page)).toBe(true);
  });

  it('seven execution hubs preserved in catalog', () => {
    expect(EXECUTION_HUBS).toHaveLength(7);
  });
});

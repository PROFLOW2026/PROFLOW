import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectIdDir = path.join(
  process.cwd(),
  'src/app/[locale]/(app)/projects/[projectId]',
);

function readWorkspace(name: string): string {
  return readFileSync(path.join(projectIdDir, name), 'utf8');
}

/** Work/details must share the cached loader used by the money hub (see load-project-detail.ts). */
describe('project work/details workspaces', () => {
  it('load detail via request-scoped loadProjectDetail, not loadProjectDetailInContext', () => {
    for (const file of ['project-work-workspace.tsx', 'project-details-workspace.tsx']) {
      const source = readWorkspace(file);
      expect(source).toContain('loadProjectDetail(projectId');
      expect(source).not.toContain('loadProjectDetailInContext');
      expect(source).toContain('withOrgContext');
      expect(source).not.toContain('withProjectOrgContext');
    }
  });
});

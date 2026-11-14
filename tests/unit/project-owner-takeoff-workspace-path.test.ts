import { describe, expect, it } from 'vitest';
import { isOwnerTakeoffWorkspacePath } from '@/app/[locale]/(app)/projects/[projectId]/owner-takeoff-workspace-path';

const PROJECT_ID = 'proj-takeoff-1';

describe('owner takeoff workspace path', () => {
  it('detects takeoff list and workspace URLs with locale prefix', () => {
    expect(isOwnerTakeoffWorkspacePath(`/projects/${PROJECT_ID}/takeoff`, PROJECT_ID)).toBe(true);
    expect(isOwnerTakeoffWorkspacePath(`/he-IL/projects/${PROJECT_ID}/takeoff`, PROJECT_ID)).toBe(true);
    expect(isOwnerTakeoffWorkspacePath(`/en/projects/${PROJECT_ID}/takeoff/abc`, PROJECT_ID)).toBe(true);
  });

  it('does not treat other project routes as takeoff workspace', () => {
    expect(isOwnerTakeoffWorkspacePath(`/projects/${PROJECT_ID}`, PROJECT_ID)).toBe(false);
    expect(isOwnerTakeoffWorkspacePath(`/projects/${PROJECT_ID}/money`, PROJECT_ID)).toBe(false);
    expect(isOwnerTakeoffWorkspacePath(`/projects/other/takeoff`, PROJECT_ID)).toBe(false);
  });
});
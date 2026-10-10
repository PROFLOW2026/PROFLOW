import { describe, expect, it } from 'vitest';
import { isOwnerExecutionWorkspacePath } from '@/modules/project-workspace/domain/execution-workspace-path';
import { isOwnerProjectWorkWorkspacePath } from '@/modules/project-workspace/domain/project-work-workspace-path';

const PROJECT_ID = '02dd65ce-adbb-4cdf-8c2e-613832ecd622';

describe('project work workspace path detection', () => {
  it('treats project task routes as project work workspace', () => {
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/tasks`, PROJECT_ID)).toBe(true);
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/boards`, PROJECT_ID)).toBe(true);
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/boards/abc`, PROJECT_ID)).toBe(true);
    expect(isOwnerProjectWorkWorkspacePath(`/he-IL/projects/${PROJECT_ID}/calendar`, PROJECT_ID)).toBe(true);
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/timeline`, PROJECT_ID)).toBe(true);
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/site-meetings`, PROJECT_ID)).toBe(true);
  });

  it('keeps commercial project home and financial routes off project work workspace', () => {
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}`, PROJECT_ID)).toBe(false);
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/financials`, PROJECT_ID)).toBe(false);
  });

  it('prefers project work over execution for shared UWM segments', () => {
    expect(isOwnerProjectWorkWorkspacePath(`/projects/${PROJECT_ID}/boards`, PROJECT_ID)).toBe(true);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/boards`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/tasks`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/calendar`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/timeline`, PROJECT_ID)).toBe(false);
  });
});

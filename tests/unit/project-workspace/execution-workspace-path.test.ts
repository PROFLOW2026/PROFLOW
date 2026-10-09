import { describe, expect, it } from 'vitest';
import {
  isCommercialProjectHomePath,
  isOwnerExecutionWorkspacePath,
} from '@/modules/project-workspace/domain/execution-workspace-path';

const PROJECT_ID = '02dd65ce-adbb-4cdf-8c2e-613832ecd622';

describe('execution workspace path detection', () => {
  it('treats the commercial project home as non-execution', () => {
    expect(isCommercialProjectHomePath(`/he-IL/projects/${PROJECT_ID}`, PROJECT_ID)).toBe(true);
    expect(isOwnerExecutionWorkspacePath(`/he-IL/projects/${PROJECT_ID}`, PROJECT_ID)).toBe(false);
  });

  it('treats execution hub routes as execution workspace', () => {
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/execution`, PROJECT_ID)).toBe(true);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/contractors`, PROJECT_ID)).toBe(true);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/claims`, PROJECT_ID)).toBe(true);
  });

  it('keeps commercial financial routes on the commercial shell', () => {
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/financials`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/boq-measure`, PROJECT_ID)).toBe(false);
  });
});

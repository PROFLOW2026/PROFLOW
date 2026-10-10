import { describe, expect, it } from 'vitest';
import {
  isCommercialProjectHomePath,
  isOwnerExecutionWorkspacePath,
  isEmployeeExecutionWorkspacePath,
} from '@/modules/project-workspace/domain/execution-workspace-path';
import { isOwnerProjectWorkWorkspacePath } from '@/modules/project-workspace/domain/project-work-workspace-path';

const PROJECT_ID = '02dd65ce-adbb-4cdf-8c2e-613832ecd622';

function ownerLayoutWorkspaceFlags(pathname: string, projectId: string) {
  const inProjectWorkWorkspace = isOwnerProjectWorkWorkspacePath(pathname, projectId);
  const inExecutionWorkspace =
    !inProjectWorkWorkspace && isOwnerExecutionWorkspacePath(pathname, projectId);
  return {
    inExecutionWorkspace,
    inProjectWorkWorkspace,
    inCommercialWorkspace: !inExecutionWorkspace && !inProjectWorkWorkspace,
  };
}

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

  it('does not classify shared UWM segments as execution workspace (work-first)', () => {
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/tasks`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/boards`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/calendar`, PROJECT_ID)).toBe(false);
    expect(isOwnerExecutionWorkspacePath(`/projects/${PROJECT_ID}/timeline`, PROJECT_ID)).toBe(false);
  });

  it('applies the same work-first guard on employee execution paths for tasks', () => {
    expect(isEmployeeExecutionWorkspacePath(`/employee/projects/${PROJECT_ID}/tasks`, PROJECT_ID)).toBe(
      false,
    );
    expect(isEmployeeExecutionWorkspacePath(`/employee/projects/${PROJECT_ID}/execution`, PROJECT_ID)).toBe(
      true,
    );
  });
});

/**
 * Owner audit §10 route matrix — layout workspace mode after REG-006 work-first fix (§12 preserve).
 */
describe('owner layout workspace precedence (audit §10 / §12)', () => {
  it('12A — commercial project home uses commercial layout chrome', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}`, PROJECT_ID);
    expect(isCommercialProjectHomePath(`/projects/${PROJECT_ID}`, PROJECT_ID)).toBe(true);
    expect(flags.inCommercialWorkspace).toBe(true);
    expect(flags.inExecutionWorkspace).toBe(false);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });

  it('12B — /tasks uses project-work layout, not execution', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/tasks`, PROJECT_ID);
    expect(flags.inProjectWorkWorkspace).toBe(true);
    expect(flags.inExecutionWorkspace).toBe(false);
  });

  it('12C — /boards uses project-work layout, not execution', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/boards`, PROJECT_ID);
    expect(flags.inProjectWorkWorkspace).toBe(true);
    expect(flags.inExecutionWorkspace).toBe(false);
  });

  it('12D — /calendar uses project-work layout, not execution', () => {
    const flags = ownerLayoutWorkspaceFlags(`/he-IL/projects/${PROJECT_ID}/calendar`, PROJECT_ID);
    expect(flags.inProjectWorkWorkspace).toBe(true);
    expect(flags.inExecutionWorkspace).toBe(false);
  });

  it('12E — /timeline uses project-work layout, not execution', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/timeline`, PROJECT_ID);
    expect(flags.inProjectWorkWorkspace).toBe(true);
    expect(flags.inExecutionWorkspace).toBe(false);
  });

  it('12E2 — /site-meetings from project-work nav uses project-work layout', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/site-meetings`, PROJECT_ID);
    expect(flags.inProjectWorkWorkspace).toBe(true);
    expect(flags.inExecutionWorkspace).toBe(false);
  });

  it('12F — /execution uses execution layout', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/execution`, PROJECT_ID);
    expect(flags.inExecutionWorkspace).toBe(true);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });

  it('12G — /contractors uses execution layout', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/contractors`, PROJECT_ID);
    expect(flags.inExecutionWorkspace).toBe(true);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });

  it('12H — /contractor-access uses execution layout', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/contractor-access`, PROJECT_ID);
    expect(flags.inExecutionWorkspace).toBe(true);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });

  it('12I — contractor agreement detail stays on execution layout', () => {
    const flags = ownerLayoutWorkspaceFlags(
      `/projects/${PROJECT_ID}/contractors/agreement-1`,
      PROJECT_ID,
    );
    expect(flags.inExecutionWorkspace).toBe(true);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });

  it('12J — execution-planning hub route stays on execution layout', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/execution-planning`, PROJECT_ID);
    expect(flags.inExecutionWorkspace).toBe(true);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });

  it('12K — quality module routes (rfi) stay on execution layout', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/rfi`, PROJECT_ID);
    expect(flags.inExecutionWorkspace).toBe(true);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });

  it('12L — /financials stays on commercial layout', () => {
    const flags = ownerLayoutWorkspaceFlags(`/projects/${PROJECT_ID}/financials`, PROJECT_ID);
    expect(flags.inCommercialWorkspace).toBe(true);
    expect(flags.inExecutionWorkspace).toBe(false);
    expect(flags.inProjectWorkWorkspace).toBe(false);
  });
});

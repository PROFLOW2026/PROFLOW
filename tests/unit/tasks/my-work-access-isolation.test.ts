import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';

const listWorkspacesForOrg = vi.fn();
const findWorkspaceIdsByActor = vi.fn();
const getWorkspaceScope = vi.fn();

vi.mock('@/modules/workspaces', () => ({
  listWorkspacesForOrg: (...args: unknown[]) => listWorkspacesForOrg(...args),
  findWorkspaceIdsByActor: (...args: unknown[]) => findWorkspaceIdsByActor(...args),
}));

vi.mock('@/modules/workspaces/domain/access', () => ({
  getWorkspaceScope: (...args: unknown[]) => getWorkspaceScope(...args),
}));

import { resolveAccessibleWorkspaceIds } from '@/modules/tasks/application/accessible-workspaces';

describe('My Work workspace access isolation', () => {
  const context = {
    db: {},
    organizationId: 'org-1',
    membershipId: 'mem-1',
  } as unknown as OrgContext;

  beforeEach(() => {
    vi.clearAllMocks();
    getWorkspaceScope.mockReturnValue('member_only');
    findWorkspaceIdsByActor.mockResolvedValue(['ws-member']);
    listWorkspacesForOrg.mockResolvedValue([
      { id: 'ws-org-visible', workspaceVisibility: 'organization' },
      { id: 'ws-restricted', workspaceVisibility: 'restricted' },
    ]);
  });

  it('member scope uses org-visible workspaces plus explicit membership only', async () => {
    const workspaceIds = await resolveAccessibleWorkspaceIds(context);

    expect(workspaceIds).toEqual(expect.arrayContaining(['ws-org-visible', 'ws-member']));
    expect(workspaceIds).not.toContain('ws-restricted');
    expect(new Set(workspaceIds).size).toBe(workspaceIds.length);
  });

  it('full workspace scope includes every non-archived workspace from org list', async () => {
    getWorkspaceScope.mockReturnValue('full');
    listWorkspacesForOrg.mockResolvedValue([
      { id: 'ws-a', workspaceVisibility: 'restricted' },
      { id: 'ws-b', workspaceVisibility: 'organization' },
    ]);

    const workspaceIds = await resolveAccessibleWorkspaceIds(context);

    expect(workspaceIds).toEqual(['ws-a', 'ws-b']);
    expect(findWorkspaceIdsByActor).not.toHaveBeenCalled();
  });

  it('honors explicit workspaceId filter without widening scope', async () => {
    const workspaceIds = await resolveAccessibleWorkspaceIds(context, {
      workspaceId: 'ws-single',
    });

    expect(workspaceIds).toEqual(['ws-single']);
    expect(listWorkspacesForOrg).not.toHaveBeenCalled();
  });
});

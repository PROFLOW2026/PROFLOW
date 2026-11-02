/**
 * The project's cloud folder for the infrastructure tree: the standard provisioning first; the facts the
 * authorized caller read under their own session only when the trusted read of the project is empty.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolveProjectFolderId, type InfraProjectSnapshot } from '@/modules/infra-mapping/application/project-folder';

const snapshot: InfraProjectSnapshot = {
  id: 'p1',
  name: 'פרויקט',
  documentNumber: '1001',
  clientId: 'c1',
  clientName: 'לקוח',
};

describe('resolveProjectFolderId', () => {
  it('uses the standard provisioning and never the snapshot when it finds the project', async () => {
    const ensureFromSnapshot = vi.fn(async () => 'from-snapshot');
    const result = await resolveProjectFolderId({ provision: async () => 'folder-1', snapshot, ensureFromSnapshot });
    expect(result).toEqual({ folderId: 'folder-1', source: 'stored' });
    expect(ensureFromSnapshot).not.toHaveBeenCalled();
  });

  it('falls back to the caller-read project facts when the trusted read of the project is empty', async () => {
    const ensureFromSnapshot = vi.fn(async () => 'folder-2');
    const result = await resolveProjectFolderId({ provision: async () => null, snapshot, ensureFromSnapshot });
    expect(result).toEqual({ folderId: 'folder-2', source: 'snapshot' });
    expect(ensureFromSnapshot).toHaveBeenCalledWith(snapshot);
  });

  it('reports nothing when neither the trusted read nor the caller can provide the project', async () => {
    const ensureFromSnapshot = vi.fn(async () => 'x');
    expect(await resolveProjectFolderId({ provision: async () => null, snapshot: null, ensureFromSnapshot })).toBeNull();
    expect(await resolveProjectFolderId({ provision: async () => null, snapshot: undefined, ensureFromSnapshot })).toBeNull();
    expect(ensureFromSnapshot).not.toHaveBeenCalled();
  });

  it('lets a real provisioning failure surface instead of masking it with the snapshot', async () => {
    const ensureFromSnapshot = vi.fn(async () => 'x');
    await expect(
      resolveProjectFolderId({
        provision: async () => {
          throw new Error('provider down');
        },
        snapshot,
        ensureFromSnapshot,
      }),
    ).rejects.toThrow('provider down');
    expect(ensureFromSnapshot).not.toHaveBeenCalled();
  });
});

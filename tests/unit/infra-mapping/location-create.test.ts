/**
 * Adding a location on the infrastructure screen: location + real cloud folder, or neither.
 */
import { describe, expect, it, vi } from 'vitest';
import { createLocationWithFolder, type LocationCreatePorts } from '@/modules/infra-mapping/application/location-create';

type Failure = { error: string };

function ports(overrides: Partial<LocationCreatePorts<Failure>> = {}) {
  const base = {
    isCloudConnected: vi.fn(async () => true),
    createLocation: vi.fn(async () => ({ ok: true as const, locationId: 'loc-1' })),
    ensureFolder: vi.fn(async () => true),
    rollback: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides } as typeof base & LocationCreatePorts<Failure>;
}

describe('createLocationWithFolder', () => {
  it('creates the location and its folder when the cloud is connected', async () => {
    const p = ports();
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'created', locationId: 'loc-1' });
    expect(p.ensureFolder).toHaveBeenCalledWith('loc-1');
    expect(p.rollback).not.toHaveBeenCalled();
  });

  it('creates nothing when there is no active cloud connection', async () => {
    const p = ports({ isCloudConnected: vi.fn(async () => false) });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'no_cloud' });
    expect(p.createLocation).not.toHaveBeenCalled();
    expect(p.ensureFolder).not.toHaveBeenCalled();
  });

  it('returns the location rule failure untouched and makes no folder', async () => {
    const p = ports({ createLocation: vi.fn(async () => ({ ok: false as const, error: 'קוד כפול' })) });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'rejected', failure: { error: 'קוד כפול' } });
    expect(p.ensureFolder).not.toHaveBeenCalled();
    expect(p.rollback).not.toHaveBeenCalled();
  });

  it('takes the location back out when the folder cannot be created (no false success)', async () => {
    const p = ports({ ensureFolder: vi.fn(async () => false) });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'folder_failed' });
    expect(p.rollback).toHaveBeenCalledWith('loc-1');
  });

  it('treats a provider error while creating the folder the same way', async () => {
    const p = ports({
      ensureFolder: vi.fn(async () => {
        throw new Error('provider 500');
      }),
    });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'folder_failed' });
    expect(p.rollback).toHaveBeenCalledWith('loc-1');
  });

  it('still reports the failure when the rollback itself fails', async () => {
    const p = ports({
      ensureFolder: vi.fn(async () => false),
      rollback: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'folder_failed' });
  });
});

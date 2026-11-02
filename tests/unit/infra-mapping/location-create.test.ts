/**
 * Adding a location on the infrastructure screen: location + real cloud folder, or neither.
 */
import { describe, expect, it, vi } from 'vitest';
import { createLocationWithFolder, type LocationCreatePorts } from '@/modules/infra-mapping/application/location-create';
import { describeFolderFailure } from '@/modules/infra-mapping/domain/folder-failure';

type Failure = { error: string };

function ports(overrides: Partial<LocationCreatePorts<Failure>> = {}) {
  const base = {
    isCloudConnected: vi.fn(async () => true),
    createLocation: vi.fn(async () => ({ ok: true as const, locationId: 'loc-1' })),
    ensureFolder: vi.fn(async (): Promise<{ ok: true } | { ok: false; reason: string }> => ({ ok: true })),
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

  it('takes the location back out and reports the reason when the folder cannot be created', async () => {
    const p = ports({ ensureFolder: vi.fn(async () => ({ ok: false as const, reason: 'folder/provider_403' })) });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'folder_failed', reason: 'folder/provider_403' });
    expect(p.rollback).toHaveBeenCalledWith('loc-1');
  });

  it('treats an unexpected error while creating the folder the same way', async () => {
    const p = ports({
      ensureFolder: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'folder_failed', reason: 'unexpected' });
    expect(p.rollback).toHaveBeenCalledWith('loc-1');
  });

  it('still reports the failure when the rollback itself fails', async () => {
    const p = ports({
      ensureFolder: vi.fn(async () => ({ ok: false as const, reason: 'folder/x' })),
      rollback: vi.fn(async () => {
        throw new Error('db down');
      }),
    });
    expect(await createLocationWithFolder(p)).toEqual({ kind: 'folder_failed', reason: 'folder/x' });
  });
});

describe('describeFolderFailure', () => {
  it('reports the provider HTTP status only - never the body, URL or token', () => {
    const error = Object.assign(new Error('Provider request failed (403)'), {
      name: 'ProviderHttpError',
      status: 403,
      bodySnippet: '{"error":{"code":"accessDenied"}} Bearer eyJsecret',
    });
    const info = describeFolderFailure('folder', error);
    expect(info).toEqual({ stage: 'folder', code: 'provider_403' });
    expect(JSON.stringify(info)).not.toMatch(/secret|Bearer/);
  });

  it('reports a database error code with its constraint (also when wrapped in a cause)', () => {
    const pg = Object.assign(new Error('duplicate key'), { code: '23505', constraint_name: 'infra_folder_mappings_folder_uq' });
    const wrapped = new Error('Failed query', { cause: pg });
    expect(describeFolderFailure('folder', wrapped).code).toBe('pg_23505_infra_folder_mappings_folder_uq');
  });

  it('falls back to the application message key, then to the error name', () => {
    const app = Object.assign(new Error('x'), { messageKey: 'infraMapping.errors.projectFolder' });
    expect(describeFolderFailure('project_folder', app)).toEqual({ stage: 'project_folder', code: 'infraMapping.errors.projectFolder' });
    expect(describeFolderFailure('connection', new TypeError('fetch failed')).code).toBe('TypeError');
  });
});

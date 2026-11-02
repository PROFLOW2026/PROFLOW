/**
 * Adding a location on the infrastructure screen = the location AND its real cloud folder, or neither.
 *
 * - no active cloud connection  -> nothing is created
 * - the location is rejected    -> its own error is returned untouched (validation, duplicate code, ...)
 * - the folder cannot be made   -> the just-created location is archived again, so no location is left
 *                                  that looks synced while its folder is missing; the reason (step + code,
 *                                  never credentials) is passed on so it can be shown and logged
 *
 * Pure orchestration over narrow ports: unit-testable without a database or a provider.
 */
export interface LocationCreatePorts<Failure> {
  isCloudConnected(): Promise<boolean>;
  createLocation(): Promise<{ readonly ok: true; readonly locationId: string } | ({ readonly ok: false } & Failure)>;
  /** ok only when the location now has a ready folder in the cloud; otherwise why not. */
  ensureFolder(locationId: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
  /** Takes a location that has no folder back out of the tree. */
  rollback(locationId: string): Promise<void>;
}

export type LocationCreateOutcome<Failure> =
  | { readonly kind: 'created'; readonly locationId: string }
  | { readonly kind: 'no_cloud' }
  | { readonly kind: 'rejected'; readonly failure: Failure }
  | { readonly kind: 'folder_failed'; readonly reason: string };

export async function createLocationWithFolder<Failure>(
  ports: LocationCreatePorts<Failure>,
): Promise<LocationCreateOutcome<Failure>> {
  if (!(await ports.isCloudConnected())) return { kind: 'no_cloud' };

  const created = await ports.createLocation();
  if (!created.ok) {
    const { ok: _ok, ...failure } = created;
    return { kind: 'rejected', failure: failure as unknown as Failure };
  }

  let folder: Awaited<ReturnType<LocationCreatePorts<Failure>['ensureFolder']>>;
  try {
    folder = await ports.ensureFolder(created.locationId);
  } catch {
    folder = { ok: false, reason: 'unexpected' };
  }
  if (folder.ok) return { kind: 'created', locationId: created.locationId };

  try {
    await ports.rollback(created.locationId);
  } catch {
    // Still reported as a failure below; an un-rolled-back location shows as "no folder" and the
    // existing folder sync can finish it.
  }
  return { kind: 'folder_failed', reason: folder.reason };
}

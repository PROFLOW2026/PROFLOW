'use server';

import { revalidatePath } from 'next/cache';
import { requireExternalContext } from '@/modules/contractor-access';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import {
  archiveLocationAction,
  createLocationAction,
  generateLocationsAction,
  moveLocationAction,
  restoreLocationAction,
  updateLocationAction,
} from '@/modules/project-profile/ui/structure-actions';
import type {
  CreateLocationPayload,
  GenerateLocationsPayload,
  LocationRefPayload,
  MoveLocationPayload,
  StructureActionResult,
  UpdateLocationPayload,
} from '@/modules/project-profile/ui/types';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  mapServerActionError,
} from '@/shared/errors';
import { getTranslations } from 'next-intl/server';
import {
  beginCapture,
  getCaptureDetail,
  listCaptures,
  loadDescriptorSuggestions,
  openCaptureInCloud,
  removeCapture,
  saveMarkings,
  updateCapture,
  type BeginCaptureResult,
  type SaveMarkingsResult,
} from './application/captures';
import {
  beginComparisonSave,
  finalizeComparisonSave,
  listComparisons,
  removeComparison,
  type BeginComparisonResult,
} from './application/comparisons';
import { beginVideoCapture, type BeginVideoCaptureResult } from './application/videos';
import { assertCanManageLocations, organizationFor } from './application/access';
import type { InfraActor } from './application/ports';
import { loadInfraWorkspace, type InfraWorkspaceData } from './application/workspace';
import type { SyncResult } from './application/folders';
import {
  INFRA_DB_PENDING_MESSAGE,
  INFRA_ERROR_MESSAGES,
  INFRA_FORBIDDEN,
  INFRA_GENERIC_ERROR,
  INFRA_NOT_FOUND,
  isMissingInfraSchema,
} from './domain/messages';
import type {
  InfraCaptureDetailDto,
  InfraCaptureDto,
  InfraComparisonDto,
  InfraListPage,
  InfraViewer,
} from './domain/types';
import {
  folderLinkSchema,
  folderSyncSchema,
  type BeginCaptureInput,
  type BeginComparisonInput,
  type BeginVideoCaptureInput,
  type FolderLinkInput,
  type FolderSyncInput,
  type ListCapturesInput,
  type SaveMarkingsInput,
  type UpdateCaptureInput,
} from './domain/validation';
import { infraDeps } from './server';
import { infraVideoPort } from './video-server';

export type InfraResult<T = undefined> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; readonly dbPending?: boolean };

async function failure(error: unknown): Promise<{ ok: false; error: string; dbPending?: boolean }> {
  if (isMissingInfraSchema(error)) return { ok: false, error: INFRA_DB_PENDING_MESSAGE, dbPending: true };
  if (error instanceof AppError && INFRA_ERROR_MESSAGES[error.messageKey]) {
    return { ok: false, error: INFRA_ERROR_MESSAGES[error.messageKey]! };
  }
  if (error instanceof AuthorizationError) return { ok: false, error: INFRA_FORBIDDEN };
  if (error instanceof NotFoundError) return { ok: false, error: INFRA_NOT_FOUND };
  try {
    const [tErrors, tValidation] = await Promise.all([getTranslations('errors'), getTranslations('validation')]);
    const mapped = mapServerActionError(error, {
      tErrors: (key) => tErrors(key as never),
      tValidation: (key) => tValidation(key as never),
      rethrowUnknown: false,
    });
    if (error instanceof ValidationError || error instanceof AppError) return { ok: false, error: mapped.error };
  } catch {
    // fall through to the generic message
  }
  return { ok: false, error: INFRA_GENERIC_ERROR };
}

async function withActor<T>(viewer: InfraViewer, work: (actor: InfraActor) => Promise<T>): Promise<T> {
  if (viewer === 'external') {
    const context = await requireExternalContext();
    return work({ kind: 'external', context });
  }
  return withOrgContext((context) => work({ kind: 'internal', context }));
}

async function run<T>(viewer: InfraViewer, work: (actor: InfraActor) => Promise<T>): Promise<InfraResult<T>> {
  try {
    return { ok: true, data: await withActor(viewer, work) };
  } catch (error) {
    return failure(error);
  }
}

// ── workspace ───────────────────────────────────────────────────────────────────────────────────

export async function loadInfraWorkspaceAction(input: {
  viewer: InfraViewer;
  projectId: string;
  organizationId?: string | null;
  taskId?: string | null;
}): Promise<InfraResult<InfraWorkspaceData>> {
  return run(input.viewer, (actor) =>
    loadInfraWorkspace(actor, {
      projectId: input.projectId,
      organizationId: input.organizationId,
      taskId: input.taskId,
      employeeApp: actor.kind === 'internal' && isEmployeeAppUser(actor.context),
    }),
  );
}

// ── captures ────────────────────────────────────────────────────────────────────────────────────

export async function beginCaptureAction(viewer: InfraViewer, input: BeginCaptureInput): Promise<InfraResult<BeginCaptureResult>> {
  return run(viewer, (actor) => beginCapture(actor, input, infraDeps));
}

/**
 * Registers an approved short video (owner / office accounts only) and returns the chunked-upload
 * ticket. The bytes follow through `/api/infra/video-upload/:evidenceId`.
 */
export async function beginVideoCaptureAction(
  viewer: InfraViewer,
  input: BeginVideoCaptureInput,
): Promise<InfraResult<BeginVideoCaptureResult>> {
  return run(viewer, async (actor) => {
    if (actor.kind !== 'internal' || isEmployeeAppUser(actor.context)) throw new AuthorizationError('infra:video');
    return beginVideoCapture(actor, input, infraDeps, infraVideoPort);
  });
}

export async function listCapturesAction(
  viewer: InfraViewer,
  input: ListCapturesInput,
): Promise<InfraResult<InfraListPage<InfraCaptureDto>>> {
  return run(viewer, (actor) => listCaptures(actor, input));
}

export async function getCaptureDetailAction(
  viewer: InfraViewer,
  input: { captureId: string; organizationId?: string | null },
): Promise<InfraResult<InfraCaptureDetailDto>> {
  return run(viewer, (actor) => getCaptureDetail(actor, input));
}

export async function loadDescriptorSuggestionsAction(
  viewer: InfraViewer,
  input: { projectId: string; organizationId?: string | null },
): Promise<InfraResult<{ rooms: string[]; walls: string[] }>> {
  return run(viewer, (actor) => loadDescriptorSuggestions(actor, input));
}

export async function updateCaptureAction(viewer: InfraViewer, input: UpdateCaptureInput): Promise<InfraResult> {
  return run(viewer, async (actor) => {
    await updateCapture(actor, input, infraDeps);
    return undefined;
  });
}

export async function saveMarkingsAction(viewer: InfraViewer, input: SaveMarkingsInput): Promise<InfraResult<SaveMarkingsResult>> {
  return run(viewer, (actor) => saveMarkings(actor, input, infraDeps));
}

export async function removeCaptureAction(
  viewer: InfraViewer,
  input: { captureId: string; organizationId?: string | null },
): Promise<InfraResult> {
  return run(viewer, async (actor) => {
    await removeCapture(actor, input, infraDeps);
    return undefined;
  });
}

/** Internal main-app users only (employee accounts never get direct provider links). */
export async function openCaptureInCloudAction(input: { captureId: string }): Promise<InfraResult<{ url: string | null }>> {
  return run('internal', async (actor) => {
    if (actor.kind === 'internal' && isEmployeeAppUser(actor.context)) throw new AuthorizationError('infra:cloud_link');
    return openCaptureInCloud(actor, input, infraDeps);
  });
}

// ── comparisons (saved only by explicit user choice) ───────────────────────────────────────────

export async function beginComparisonSaveAction(
  viewer: InfraViewer,
  input: BeginComparisonInput,
): Promise<InfraResult<BeginComparisonResult>> {
  return run(viewer, (actor) => beginComparisonSave(actor, input, infraDeps));
}

export async function finalizeComparisonSaveAction(
  viewer: InfraViewer,
  input: { comparisonId: string; organizationId?: string | null },
): Promise<InfraResult<InfraComparisonDto>> {
  return run(viewer, (actor) => finalizeComparisonSave(actor, input, infraDeps));
}

export async function listComparisonsAction(
  viewer: InfraViewer,
  input: { projectId: string; organizationId?: string | null; locationId?: string | null; taskId?: string | null },
): Promise<InfraResult<InfraComparisonDto[]>> {
  return run(viewer, (actor) => listComparisons(actor, input));
}

export async function removeComparisonAction(
  viewer: InfraViewer,
  input: { comparisonId: string; organizationId?: string | null },
): Promise<InfraResult> {
  return run(viewer, async (actor) => {
    await removeComparison(actor, input);
    return undefined;
  });
}

// ── locations + cloud folders (internal, project.manage) ───────────────────────────────────────

const SYNC_BATCH = 20;

async function bestEffortFolder(
  projectId: string,
  work: (actor: InfraActor, organizationId: string) => Promise<unknown>,
): Promise<void> {
  try {
    await withOrgContext(async (context) => {
      const actor: InfraActor = { kind: 'internal', context };
      await assertCanManageLocations(actor, projectId);
      await work(actor, await organizationFor(actor, null));
    });
  } catch {
    // The location change itself already succeeded; the folder is reconciled on the next sync / upload.
  }
}

/** Existing structure actions + the matching cloud-folder change (same signature, drop-in for LocationsCard). */
export async function infraUpdateLocationAction(payload: UpdateLocationPayload): Promise<StructureActionResult> {
  const result = await updateLocationAction(payload);
  if (result.ok && payload.name !== undefined) {
    await bestEffortFolder(payload.projectId, (_actor, organizationId) =>
      infraDeps.folders.renameFolder({ organizationId, projectId: payload.projectId, locationId: payload.locationId }),
    );
  }
  return result;
}

export async function infraMoveLocationAction(payload: MoveLocationPayload): Promise<StructureActionResult> {
  const result = await moveLocationAction(payload);
  if (result.ok) {
    await bestEffortFolder(payload.projectId, (_actor, organizationId) =>
      infraDeps.folders.moveFolder({ organizationId, projectId: payload.projectId, locationId: payload.locationId }),
    );
  }
  return result;
}

export async function infraCreateLocationAction(payload: CreateLocationPayload): Promise<StructureActionResult> {
  return createLocationAction(payload);
}

export async function infraArchiveLocationAction(payload: LocationRefPayload): Promise<StructureActionResult> {
  return archiveLocationAction(payload);
}

export async function infraRestoreLocationAction(payload: LocationRefPayload): Promise<StructureActionResult> {
  return restoreLocationAction(payload);
}

export async function infraGenerateLocationsAction(payload: GenerateLocationsPayload): Promise<StructureActionResult> {
  return generateLocationsAction(payload);
}

/**
 * Creates the real cloud folders for the location tree in paced batches. The caller loops until
 * `remaining` is 0 (provider rate limits make one giant call unsafe for hundreds of apartments).
 */
export async function syncInfraFoldersAction(input: FolderSyncInput): Promise<InfraResult<SyncResult>> {
  return run('internal', async (actor) => {
    const parsed = folderSyncSchema.parse(input);
    await assertCanManageLocations(actor, parsed.projectId);
    const result = await infraDeps.folders.syncFolders({
      organizationId: await organizationFor(actor, null),
      projectId: parsed.projectId,
      locationIds: parsed.locationIds ?? null,
      batchSize: Math.min(parsed.batchSize, SYNC_BATCH),
      createdByUserId: actor.kind === 'internal' ? actor.context.userId : null,
    });
    revalidatePath('/', 'layout');
    return result;
  });
}

/** Points a location (or the project's infrastructure root) at a folder the customer already has. */
export async function linkInfraFolderAction(input: FolderLinkInput): Promise<InfraResult> {
  return run('internal', async (actor) => {
    const parsed = folderLinkSchema.parse(input);
    await assertCanManageLocations(actor, parsed.projectId);
    await infraDeps.folders.linkFolder({
      organizationId: await organizationFor(actor, null),
      projectId: parsed.projectId,
      locationId: parsed.locationId ?? null,
      externalFolderId: parsed.externalFolderId,
      createdByUserId: actor.kind === 'internal' ? actor.context.userId : null,
    });
    revalidatePath('/', 'layout');
    return undefined;
  });
}

export type { InfraWorkspaceData };

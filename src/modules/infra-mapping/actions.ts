'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireExternalContext } from '@/modules/contractor-access';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import {
  addUnitsAction,
  archiveLocationAction,
  createLocationAction,
  createStructureAction,
  moveLocationAction,
  restoreLocationAction,
  setSpaceLevelAction,
  setUnitKindAction,
  setUnitLevelsAction,
  updateLocationAction,
} from '@/modules/project-profile/ui/structure-actions';
import type {
  AddUnitsPayload,
  CreateLocationPayload,
  CreateStructurePayload,
  LocationRefPayload,
  SetSpaceLevelPayload,
  SetUnitKindPayload,
  SetUnitLevelsPayload,
  MoveLocationPayload,
  StructureActionResult,
  UpdateLocationPayload,
} from '@/modules/project-profile/ui/types';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  NotFoundError,
  ServiceUnavailableError,
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
import type { FolderInspection, SyncResult } from './application/folders';
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
import { listFolderMappingRows } from './data/infra.repository';
import { logger } from '@/shared/observability/logger';
import { infraDeps, isInfraStorageConnected } from './server';
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
  return run(input.viewer, async (actor) => {
    const data = await loadInfraWorkspace(actor, {
      projectId: input.projectId,
      organizationId: input.organizationId,
      taskId: input.taskId,
      employeeApp: actor.kind === 'internal' && isEmployeeAppUser(actor.context),
    });
    // Only the locations screen needs to know whether the cloud is connected.
    if (actor.kind === 'internal' && data.permissions.canManageLocations) {
      return { ...data, storageConnected: await isInfraStorageConnected(data.organizationId) };
    }
    return data;
  });
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

/** Shown when the structure change was saved but the matching cloud folder could not be updated. */
const FOLDER_SYNC_WARNING =
  'השינוי נשמר במערכת, אבל תיקיית המיקום בענן לא עודכנה. הקבצים לא נפגעו. פתחו את המיקום ובדקו את התיקייה, ואז נסו שוב.';

/**
 * Applies a rename / move to the location's cloud folder. A virtual location (no folder yet) has nothing to
 * update. A real failure is NOT swallowed: it is logged and reported to the user as a warning next to the saved
 * change, so a folder that was not renamed / moved is never presented as done.
 */
async function syncOwnFolder(
  projectId: string,
  locationId: string,
  apply: (organizationId: string) => Promise<unknown>,
): Promise<string | null> {
  try {
    await withOrgContext(async (context) => {
      const rows = await listFolderMappingRows(context.db, context.organizationId, projectId);
      const owns = rows.some((row) => row.locationId === locationId && row.status === 'ready');
      if (owns) await apply(context.organizationId);
    });
    return null;
  } catch (error) {
    logger.error('infra.folder_sync_failed', {
      projectId,
      locationId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    const detail = error instanceof AppError && INFRA_ERROR_MESSAGES[error.messageKey] ? ` ${INFRA_ERROR_MESSAGES[error.messageKey]}` : '';
    return `${FOLDER_SYNC_WARNING}${detail}`;
  }
}

function withWarning(result: StructureActionResult, warning: string | null): StructureActionResult {
  return warning && result.ok ? { ...result, warning } : result;
}

/** Existing structure actions + the matching cloud-folder change (same signature, drop-in for LocationsCard). */
export async function infraUpdateLocationAction(payload: UpdateLocationPayload): Promise<StructureActionResult> {
  const result = await updateLocationAction(payload);
  if (!result.ok || (payload.name === undefined && payload.code === undefined)) return result;
  return withWarning(
    result,
    await syncOwnFolder(payload.projectId, payload.locationId, (organizationId) =>
      infraDeps.folders.renameFolder({ organizationId, projectId: payload.projectId, locationId: payload.locationId }),
    ),
  );
}

export async function infraMoveLocationAction(payload: MoveLocationPayload): Promise<StructureActionResult> {
  const result = await moveLocationAction(payload);
  if (!result.ok) return result;
  return withWarning(
    result,
    await syncOwnFolder(payload.projectId, payload.locationId, (organizationId) =>
      infraDeps.folders.moveFolder({ organizationId, projectId: payload.projectId, locationId: payload.locationId }),
    ),
  );
}
/** Authorizes the caller and returns the organization that owns the cloud, or a failure result. */
async function manageableOrganization(
  projectId: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  try {
    const organizationId = await withOrgContext(async (context) => {
      const actor: InfraActor = { kind: 'internal', context };
      await assertCanManageLocations(actor, projectId);
      return organizationFor(actor, null);
    });
    return { ok: true, organizationId };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Adds a location. Locations are virtual: only a database row is written - no cloud connection is needed and no
 * cloud folder is created. The folder appears on the first upload (or when the user explicitly asks for it).
 */
export async function infraCreateLocationAction(payload: CreateLocationPayload): Promise<StructureActionResult> {
  const owner = await manageableOrganization(payload.projectId);
  if (!owner.ok) return owner;
  return createLocationAction(payload);
}

export async function infraArchiveLocationAction(payload: LocationRefPayload): Promise<StructureActionResult> {
  // Archiving never touches the cloud: folders and files stay exactly where they are.
  return archiveLocationAction(payload);
}

export async function infraRestoreLocationAction(payload: LocationRefPayload): Promise<StructureActionResult> {
  return restoreLocationAction(payload);
}

/** Structure wizard: rows only, no cloud folders (and no cloud connection required). */
export async function infraCreateStructureAction(payload: CreateStructurePayload): Promise<StructureActionResult> {
  const owner = await manageableOrganization(payload.projectId);
  if (!owner.ok) return owner;
  const result = await createStructureAction(payload);
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function infraAddUnitsAction(payload: AddUnitsPayload): Promise<StructureActionResult> {
  const owner = await manageableOrganization(payload.projectId);
  if (!owner.ok) return owner;
  return addUnitsAction(payload);
}

export async function infraSetUnitLevelsAction(payload: SetUnitLevelsPayload): Promise<StructureActionResult> {
  const owner = await manageableOrganization(payload.projectId);
  if (!owner.ok) return owner;
  return setUnitLevelsAction(payload);
}

export async function infraSetSpaceLevelAction(payload: SetSpaceLevelPayload): Promise<StructureActionResult> {
  const owner = await manageableOrganization(payload.projectId);
  if (!owner.ok) return owner;
  return setSpaceLevelAction(payload);
}

export async function infraSetUnitKindAction(payload: SetUnitKindPayload): Promise<StructureActionResult> {
  const owner = await manageableOrganization(payload.projectId);
  if (!owner.ok) return owner;
  return setUnitKindAction(payload);
}

const locationFolderRefSchema = z.object({ projectId: z.string().uuid(), locationId: z.string().uuid() });
const folderDriftSchema = locationFolderRefSchema.extend({ choice: z.enum(['adopt_cloud_name', 'restore_name']) });

/**
 * Explicit "create a cloud folder" for one chosen location. Only the needed chain is created (never one per
 * level or room). A failure is reported with a short code and nothing is shown as created.
 */
export async function infraCreateFolderAction(input: { projectId: string; locationId: string }): Promise<InfraResult<{ folderId: string }>> {
  return run('internal', async (actor) => {
    const parsed = locationFolderRefSchema.parse(input);
    await assertCanManageLocations(actor, parsed.projectId);
    const result = await infraDeps.folders.createLocationFolder({
      organizationId: await organizationFor(actor, null),
      projectId: parsed.projectId,
      locationId: parsed.locationId,
    });
    if (!result.ok) throw new ServiceUnavailableError(`Folder not created: ${result.stage}/${result.code}`, 'infraMapping.errors.folderCreate');
    revalidatePath('/', 'layout');
    return { folderId: result.folderId };
  });
}

/** Checks the one known folder of a location (on demand): fine, renamed in the cloud, or gone. */
export async function infraInspectFolderAction(input: { projectId: string; locationId: string }): Promise<InfraResult<FolderInspection>> {
  return run('internal', async (actor) => {
    const parsed = locationFolderRefSchema.parse(input);
    await assertCanManageLocations(actor, parsed.projectId);
    const result = await infraDeps.folders.inspectFolder({
      organizationId: await organizationFor(actor, null),
      projectId: parsed.projectId,
      locationId: parsed.locationId,
    });
    if (result.state === 'missing') revalidatePath('/', 'layout');
    return result;
  });
}

/** A folder renamed in the cloud: take the cloud name over as the folder name, or rename the cloud folder back. */
export async function infraResolveFolderDriftAction(input: {
  projectId: string;
  locationId: string;
  choice: 'adopt_cloud_name' | 'restore_name';
}): Promise<InfraResult> {
  return run('internal', async (actor) => {
    const parsed = folderDriftSchema.parse(input);
    await assertCanManageLocations(actor, parsed.projectId);
    await infraDeps.folders.resolveFolderDrift({
      organizationId: await organizationFor(actor, null),
      projectId: parsed.projectId,
      locationId: parsed.locationId,
      choice: parsed.choice,
    });
    revalidatePath('/', 'layout');
    return undefined;
  });
}

/** A folder that disappeared from the cloud is only replaced when the user asks for it here. */
export async function infraRecreateFolderAction(input: { projectId: string; locationId: string }): Promise<InfraResult> {
  return run('internal', async (actor) => {
    const parsed = locationFolderRefSchema.parse(input);
    await assertCanManageLocations(actor, parsed.projectId);
    await infraDeps.folders.recreateFolder({
      organizationId: await organizationFor(actor, null),
      projectId: parsed.projectId,
      locationId: parsed.locationId,
    });
    revalidatePath('/', 'layout');
    return undefined;
  });
}

/**
 * Explicit, paced folder work. With location ids: real folders for those locations (only the needed ones).
 * Without ids: REPAIR only (retries a failed creation); it never creates a folder for a virtual location.
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

import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { isOrganizationStorageConfigured } from '@/modules/external-storage/application/org-storage-gate';
import type { OrgContext } from '@/shared/auth/context';
import { findAnalysis, listFilesForAnalysis } from '../data/takeoff.repository';
import type { TakeoffFileStore } from '../ports';
import { createInMemoryTakeoffFileStore, createOrgCloudTakeoffFileStore } from './takeoff-file-store';
import { createEphemeralDiskTakeoffFileStore, purgeEphemeralTakeoffBytes } from './takeoff-ephemeral-file-store';
import {
  createEphemeralSupabaseTakeoffFileStore,
  purgeEphemeralSupabaseObjects,
} from './takeoff-ephemeral-supabase-file-store';
import { getStoragePort } from '@/shared/ports/storage';

export const TAKEOFF_PERSISTENCE = {
  persistent: 'persistent',
  ephemeral: 'ephemeral',
} as const;

export type TakeoffPersistenceMode = (typeof TAKEOFF_PERSISTENCE)[keyof typeof TAKEOFF_PERSISTENCE];

export async function resolvePersistenceModeForNewAnalysis(context: OrgContext): Promise<TakeoffPersistenceMode> {
  if (process.env.TAKEOFF_FORCE_EPHEMERAL === '1') return TAKEOFF_PERSISTENCE.ephemeral;
  if (process.env.TAKEOFF_FORCE_PERSISTENT === '1') return TAKEOFF_PERSISTENCE.persistent;
  const configured = await isOrganizationStorageConfigured(context);
  return configured ? TAKEOFF_PERSISTENCE.persistent : TAKEOFF_PERSISTENCE.ephemeral;
}

function resolveEphemeralTakeoffFileStore(): TakeoffFileStore {
  const onVercel = process.env.VERCEL === '1' || process.env.TAKEOFF_EPHEMERAL_BACKEND === 'supabase';
  if (onVercel) {
    const storage = getStoragePort();
    if (storage.configured) return createEphemeralSupabaseTakeoffFileStore(storage);
  }
  return createEphemeralDiskTakeoffFileStore();
}

export function resolveTakeoffFileStoreForMode(mode: TakeoffPersistenceMode): TakeoffFileStore {
  if (process.env.TAKEOFF_FILE_STORE === 'memory') return createInMemoryTakeoffFileStore();
  return mode === TAKEOFF_PERSISTENCE.ephemeral
    ? resolveEphemeralTakeoffFileStore()
    : createOrgCloudTakeoffFileStore();
}

export async function resolveTakeoffFileStoreForAnalysis(
  db: DbExecutor,
  organizationId: string,
  analysisId: string,
): Promise<TakeoffFileStore> {
  const analysis = await findAnalysis(db, organizationId, analysisId);
  const mode = (analysis?.persistenceMode as TakeoffPersistenceMode | undefined) ?? TAKEOFF_PERSISTENCE.persistent;
  return resolveTakeoffFileStoreForMode(mode);
}

export async function resolveTakeoffFileStoreForFile(
  db: DbExecutor,
  organizationId: string,
  fileId: string,
): Promise<{ store: TakeoffFileStore; analysisId: string }> {
  const { findFile } = await import('../data/takeoff.repository');
  const file = await findFile(db, organizationId, fileId);
  if (!file) throw new Error('not_found');
  const store = await resolveTakeoffFileStoreForAnalysis(db, organizationId, file.analysisId);
  return { store, analysisId: file.analysisId };
}

export async function purgeEphemeralAnalysisBytes(
  db: DbExecutor,
  organizationId: string,
  analysisId: string,
): Promise<void> {
  const analysis = await findAnalysis(db, organizationId, analysisId);
  if (!analysis || analysis.persistenceMode !== TAKEOFF_PERSISTENCE.ephemeral) return;
  const files = await listFilesForAnalysis(db, organizationId, analysisId);
  const ids = files.map((f) => f.id);
  if (ids.length) {
    await purgeEphemeralTakeoffBytes(organizationId, ids);
    const storage = getStoragePort();
    if (storage.configured) await purgeEphemeralSupabaseObjects(storage, organizationId, ids);
  }
}
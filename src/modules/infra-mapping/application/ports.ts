import type { OrgContext } from '@/shared/auth/context';
import type { ExternalContext } from '@/shared/external';
import type { ProjectFileDeps } from '@/modules/evidence';
import type { SyncResult } from './folders';

/**
 * Who is calling. Internal users (owner app, employee app) carry an OrgContext; contractors carry an
 * ExternalContext. Both act on the OWNING organization's storage - a contractor or employee never
 * needs a personal cloud connection.
 */
export type InfraActor =
  | { readonly kind: 'internal'; readonly context: OrgContext }
  | { readonly kind: 'external'; readonly context: ExternalContext };

export interface RelocateInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly locationId: string;
  readonly documentIds: readonly string[];
}

export interface SidecarInput {
  readonly organizationId: string;
  readonly projectId: string;
  readonly locationId: string;
  readonly fileName: string;
  readonly json: string;
}

/** Trusted (service-role) operations against the organization's storage provider. */
export interface InfraFolderPort {
  /**
   * Creates (or finds) the real cloud folder of a location and its mapping. Never throws and never
   * swallows: a failure comes back with the stage and a short safe code (logged server-side too).
   */
  createLocationFolder(input: {
    organizationId: string;
    projectId: string;
    locationId: string;
  }): Promise<{ ok: true; folderId: string } | { ok: false; stage: string; code: string }>;
  /** The cloud folder of a location (creating real folders as needed); null when it cannot be resolved. */
  resolveLocationFolder(input: { organizationId: string; projectId: string; locationId: string }): Promise<string | null>;
  syncFolders(input: {
    organizationId: string;
    projectId: string;
    locationIds?: readonly string[] | null;
    batchSize: number;
    createdByUserId: string | null;
  }): Promise<SyncResult>;
  renameFolder(input: { organizationId: string; projectId: string; locationId: string }): Promise<'renamed' | 'unchanged' | 'no_folder'>;
  moveFolder(input: { organizationId: string; projectId: string; locationId: string }): Promise<'moved' | 'unchanged' | 'no_folder'>;
  linkFolder(input: {
    organizationId: string;
    projectId: string;
    locationId: string | null;
    externalFolderId: string;
    createdByUserId: string | null;
  }): Promise<void>;
  /** Moves already-stored files into the folder of `locationId` (photo <-> folder links are kept). */
  relocateFiles(input: RelocateInput): Promise<void>;
  /** Writes the comparison sidecar JSON next to the photos; returns the provider file reference. */
  writeSidecar(input: SidecarInput): Promise<{ connectionId: string; externalFileId: string }>;
  /** Provider web URL of a stored document (open in OneDrive / Drive / ...). */
  providerWebUrl(input: { organizationId: string; documentId: string }): Promise<string | null>;
}

export interface InfraDeps {
  /** Evidence ports (bytes + trusted document writes). */
  readonly files: ProjectFileDeps;
  readonly folders: InfraFolderPort;
}

export const INFRA_UPLOAD_PATH = '/api/infra/upload';
export const INFRA_EXTERNAL_UPLOAD_PATH = '/api/contractor/infra/upload';
export const INFRA_ENTITY_TYPE = 'project_location';

export function actorOrganizationId(actor: InfraActor, requested?: string | null): string {
  return actor.kind === 'internal' ? actor.context.organizationId : (requested ?? '');
}

export function uploadUrlFor(actor: InfraActor, evidenceId: string): string {
  return `${actor.kind === 'internal' ? INFRA_UPLOAD_PATH : INFRA_EXTERNAL_UPLOAD_PATH}/${evidenceId}`;
}

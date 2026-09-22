import 'server-only';

export type {
  ExternalFileRecord,
  FolderMappingRecord,
  ProviderFileItem,
  ProviderFolderItem,
  ProviderFolderListing,
  SemanticFolderType,
  StorageConnectionRecord,
  StorageProviderKey,
} from './domain/types';
export { STORAGE_PROVIDER_LABELS } from './domain/types';
export { semanticFolderForDocumentOwner, PROJECT_SEMANTIC_FOLDERS } from './domain/semantic-folders';
export { resolveUploadFolderEntityContext } from './application/resolve-upload-folder-context';
export type { UploadFolderEntityContext } from './application/resolve-upload-folder-context';
export {
  assertOrganizationStorageAvailable,
  beginStorageOAuth,
  completeStorageOAuth,
  provisionConnectedStorage,
  failStorageOAuthCallback,
  disconnectStorageConnection,
  getOrganizationPrimaryStorage,
  listOrganizationStorageConnections,
  organizationHasActiveStorage,
  setPrimaryStorageConnection,
  validateStorageConnection,
  approveProjectTemplateAndProvision,
  openProjectTemplateInProvider,
} from './application/connection-service';
export {
  resetOrganizationStorageProviderTree,
  invalidateMissingProviderRoot,
} from './application/storage-tree-reset';
export {
  checkAndHealProviderTreeHealth,
  healStorageConnectionTreeForSettings,
  verifyProjectTemplateAgainstProvider,
  reconcileStaleReadyMappingsBatch,
} from './application/provider-tree-health';
export { readStorageTreeHealth } from './domain/storage-tree-health';
export type {
  StorageTreeHealthCapability,
  StorageTreeHealthStatus,
} from './domain/storage-tree-health';
export { ensureStorageProvisionStarted, kickStorageProvision, kickStorageProvisionIfPreparing, recoverStorageProvisionViaWorker } from './application/kick-storage-provision';
export { readProjectTemplateCapability } from './domain/project-template';
export type { ProjectTemplateSetupStatus } from './domain/project-template';
export { reconcileProjectTemplateGateState } from './application/project-template-service';
export { isOrganizationStorageConfigured } from './application/org-storage-gate';
export {
  resolveEmployeeProjectFilesGate,
  type EmployeeProjectFilesGateState,
} from './application/project-files-gate';
export {
  getExternalDocumentDownload,
  getExternalFileDownload,
  listProjectStorageFolder,
  refreshExternalFileMetadata,
  streamExternalDocumentDownload,
  uploadDocumentToExternalStorage,
} from './application/file-service';
export {
  browseProjectStorageFolder,
  createProjectStorageSubfolder,
  deleteProjectStorageItem,
  getProjectStorageBrowserContext,
  getProjectStorageFileDownload,
  getProjectStorageFileDownloadMeta,
  streamProjectStorageFileDownload,
  getProjectStorageProviderWebUrl,
  listProjectStorageMoveTargets,
  loadProjectFileBrowserInitial,
  moveProjectStorageItem,
  renameProjectStorageItem,
} from './application/browser-service';
export type {
  ProjectBrowserListingResult,
  ProjectFileBrowserInitialLoad,
  ProjectStorageBrowserContext,
} from './application/browser-service';
export {
  browseOrgStorageFolder,
  createOrgStorageSubfolder,
  deleteOrgStorageItem,
  getOrgStorageBrowserContext,
  getOrgStorageFileDownload,
  getOrgStorageFileDownloadMeta,
  streamOrgStorageFileDownload,
  getOrgStorageProviderWebUrl,
  listOrgStorageMoveTargets,
  loadOrgFileBrowserInitial,
  moveOrgStorageItem,
  renameOrgStorageItem,
  uploadOrgStorageFile,
} from './application/org-browser-service';
export type {
  OrgBrowserListingResult,
  OrgFileBrowserInitialLoad,
  OrgStorageBrowserContext,
} from './application/org-browser-service';
export { loadStorageProvisionProgress } from './application/provision-progress';
export type { StorageProvisionProgress } from './domain/project-folder-placement';
export { bootstrapOrganizationStorageTree } from './application/bootstrap';
export {
  ensureClientFolderTree,
  ensureProjectFolderTree,
} from './application/folder-provisioning';
export { listConfiguredStorageProviders, isStorageProviderConfigured } from './providers/registry';
export { findFolderMapping } from './data/folder-mappings.repository';
export { findStorageFileByDocumentId } from './data/files.repository';
export {
  assertProjectProviderFileAccess,
} from './application/browser-service';
export {
  ensureDocumentForProviderFile,
} from './application/link-provider-file-to-document';
export type { EnsureDocumentForProviderFileInput } from './application/link-provider-file-to-document';
export { runCommittedStorageWrite } from './data/storage-admin-write';

/**
 * Client-safe external-storage surface.
 * No repositories, OAuth, token handling, or Drizzle schema barrel imports.
 */
export type {
  ExternalFileRecord,
  FolderMappingRecord,
  ProviderFileItem,
  ProviderFolderItem,
  ProviderFolderListing,
  SemanticFolderType,
  StorageConnectionRecord,
  StorageConnectionStatus,
  StorageProviderKey,
} from './domain/types';
export { STORAGE_PROVIDER_LABELS } from './domain/types';
export { semanticFolderForDocumentOwner, PROJECT_SEMANTIC_FOLDERS } from './domain/semantic-folders';
export {
  readProjectTemplateCapability,
  isProjectTemplateApproved,
} from './domain/project-template';
export type {
  ProjectTemplateSetupStatus,
  ProjectTemplateCapability,
} from './domain/project-template';
export type {
  ProjectCloudFileRef,
  ProjectCloudFileBrowserActions,
  ProjectCloudFileBrowseFolderInput,
  ProjectCloudFileBrowseFolderResult,
  ProjectCloudFileBrowserInitialResult,
} from './client/project-cloud-file-picker-types';
export { toProjectCloudFileRef } from './client/project-cloud-file-picker-types';
export { ProjectCloudFilePicker } from './ui/project-cloud-file-picker';

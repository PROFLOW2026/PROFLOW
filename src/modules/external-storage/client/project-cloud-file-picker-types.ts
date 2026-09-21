import type {
  ProviderFileItem,
  ProviderFolderItem,
  SemanticFolderType,
  StorageProviderKey,
} from '../domain/types';

/** Client-safe reference to a file selected from connected project storage. */
export type ProjectCloudFileRef = {
  readonly providerFileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly parentFolderId: string;
};

export type ProjectCloudFileBrowserContext = {
  readonly provider: StorageProviderKey;
  readonly projectRootFolderId: string;
  readonly projectRootFolderName: string;
  readonly semanticShortcuts: ReadonlyArray<{
    readonly semanticFolderType: SemanticFolderType;
    readonly externalFolderId: string;
    readonly displayName: string;
  }>;
};

export type ProjectCloudFileBrowserInitialResult = {
  readonly error?: string;
  readonly context?: ProjectCloudFileBrowserContext;
  readonly folderExternalId?: string;
  readonly folderName?: string;
  readonly folders?: readonly ProviderFolderItem[];
  readonly files?: readonly ProviderFileItem[];
};

export type ProjectCloudFileBrowseFolderInput = {
  readonly projectId: string;
  readonly folderExternalId?: string | null;
  readonly folderName?: string | null;
};

export type ProjectCloudFileBrowseFolderResult = {
  readonly error?: string;
  readonly folderExternalId?: string;
  readonly folderName?: string;
  readonly folders?: readonly ProviderFolderItem[];
  readonly files?: readonly ProviderFileItem[];
};

/** Injectable browser actions so the picker works in main app and employee app surfaces. */
export type ProjectCloudFileBrowserActions = {
  readonly loadInitial: (projectId: string) => Promise<ProjectCloudFileBrowserInitialResult>;
  readonly browseFolder: (
    input: ProjectCloudFileBrowseFolderInput,
  ) => Promise<ProjectCloudFileBrowseFolderResult>;
};

export function toProjectCloudFileRef(file: ProviderFileItem): ProjectCloudFileRef | null {
  if (!file.parentId) return null;
  return {
    providerFileId: file.id,
    fileName: file.name,
    mimeType: file.mimeType ?? 'application/octet-stream',
    parentFolderId: file.parentId,
  };
}

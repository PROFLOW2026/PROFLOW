/** Organization-level project template folder name in the provider. */
export const PROJECT_TEMPLATE_FOLDER_NAME = 'תבנית פרויקט';

export type ProjectTemplateSetupStatus = 'pending_approval' | 'editing' | 'approved';

export interface ProjectTemplateCapability {
  readonly status: ProjectTemplateSetupStatus;
  readonly externalFolderId: string | null;
  readonly approvedAt: string | null;
}

export interface StorageConnectionCapabilities {
  readonly projectTemplate?: ProjectTemplateCapability;
  readonly [key: string]: unknown;
}

export function readProjectTemplateCapability(
  capabilities: StorageConnectionCapabilities | null | undefined,
): ProjectTemplateCapability {
  const raw = capabilities?.projectTemplate;
  if (!raw || typeof raw !== 'object') {
    return { status: 'pending_approval', externalFolderId: null, approvedAt: null };
  }
  const status =
    raw.status === 'editing' || raw.status === 'approved' || raw.status === 'pending_approval'
      ? raw.status
      : 'pending_approval';
  return {
    status,
    externalFolderId: typeof raw.externalFolderId === 'string' ? raw.externalFolderId : null,
    approvedAt: typeof raw.approvedAt === 'string' ? raw.approvedAt : null,
  };
}

export function isProjectTemplateApproved(
  capabilities: StorageConnectionCapabilities | null | undefined,
): boolean {
  return readProjectTemplateCapability(capabilities).status === 'approved';
}

export function withProjectTemplateCapability(
  capabilities: StorageConnectionCapabilities | null | undefined,
  patch: Partial<ProjectTemplateCapability>,
): StorageConnectionCapabilities {
  const current = readProjectTemplateCapability(capabilities);
  return {
    ...(capabilities ?? {}),
    projectTemplate: {
      status: patch.status ?? current.status,
      externalFolderId:
        patch.externalFolderId !== undefined ? patch.externalFolderId : current.externalFolderId,
      approvedAt: patch.approvedAt !== undefined ? patch.approvedAt : current.approvedAt,
    },
  };
}

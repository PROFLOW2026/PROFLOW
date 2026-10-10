import type {
  ConnectedProjectMappingStatus,
  ConnectedProjectProvisioningStatus,
  EngagementConnectionInvitationStatus,
} from '@drizzle/schema';

/** Row aligned with `engagement_connection_invitations`. */
export interface EngagementConnectionInvitationRow {
  readonly id: string;
  readonly developerOrganizationId: string;
  readonly developerProjectId: string;
  readonly subcontractAgreementId: string;
  readonly vendorId: string;
  readonly codeHash: string;
  readonly status: EngagementConnectionInvitationStatus;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly issuedByUserId: string | null;
  readonly consumedByOrganizationId: string | null;
  readonly consumedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Row aligned with `connected_project_mappings`. */
export interface ConnectedProjectMappingRow {
  readonly id: string;
  readonly invitationId: string | null;
  readonly developerOrganizationId: string;
  readonly developerProjectId: string;
  readonly subcontractAgreementId: string;
  readonly contractorOrganizationId: string;
  readonly contractorProjectId: string | null;
  readonly contractorClientId: string | null;
  readonly status: ConnectedProjectMappingStatus;
  readonly connectionVersion: number;
  readonly provisioningStatus: ConnectedProjectProvisioningStatus;
  readonly acceptedByUserId: string | null;
  readonly acceptedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DeveloperEngagementPreview {
  readonly developerOrganizationId: string;
  readonly developerOrganizationName: string;
  readonly developerProjectId: string;
  readonly developerProjectName: string;
  readonly subcontractAgreementId: string;
  readonly agreementTitle: string | null;
  readonly agreementNumber: string | null;
  readonly vendorName: string;
  readonly scopeSummary: string | null;
  readonly currency: string;
  readonly contractNetAmount: string | null;
  readonly startDate: string | null;
  readonly targetEndDate: string | null;
  readonly invitationExpiresAt: Date;
}

export const CONNECTED_PROJECT_STATUSES = [
  'accepted',
  'provisioning',
  'active',
  'sync_degraded',
  'suspended',
  'revoked',
  'archived',
] as const;

export type ConnectedProjectStatus = (typeof CONNECTED_PROJECT_STATUSES)[number];

export interface ConnectedProjectMappingView {
  readonly id: string;
  readonly contractorOrganizationId: string;
  readonly contractorProjectId: string;
  readonly developerOrganizationId: string;
  readonly developerProjectId: string;
  readonly subcontractAgreementId: string;
  readonly vendorId: string;
  readonly status: ConnectedProjectStatus;
  readonly developerOrganizationName: string | null;
  readonly developerProjectName: string | null;
}

export interface ConnectedDeveloperScope {
  readonly organizationId: string;
  readonly projectId: string;
  readonly subcontractAgreementId: string;
  readonly vendorId: string;
  readonly organizationName: string | null;
  readonly projectName: string | null;
}

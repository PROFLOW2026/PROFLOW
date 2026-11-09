import type { ProjectRiskStatus } from './constants';

export interface ProjectRiskRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly description: string;
  readonly probability: number;
  readonly impact: number;
  readonly score: number;
  readonly ownerUserId: string | null;
  readonly treatment: string | null;
  readonly status: ProjectRiskStatus;
  readonly reviewOn: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProjectRiskInput {
  readonly projectId: string;
  readonly description: string;
  readonly probability: number;
  readonly impact: number;
  readonly treatment?: string | null;
  readonly status?: ProjectRiskStatus;
  readonly reviewOn?: string | null;
}

export interface UpdateProjectRiskStatusInput {
  readonly projectId: string;
  readonly riskId: string;
  readonly status: ProjectRiskStatus;
}

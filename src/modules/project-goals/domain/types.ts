import type { ProjectGoalStatus } from './constants';

export interface ProjectGoalRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly title: string;
  readonly ownerUserId: string | null;
  readonly dueOn: string | null;
  readonly status: ProjectGoalStatus;
  readonly progressPercent: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProjectGoalInput {
  readonly projectId: string;
  readonly title: string;
  readonly dueOn?: string | null;
  readonly status?: ProjectGoalStatus;
  readonly progressPercent?: number;
  readonly ownerUserId?: string | null;
}

export interface UpdateProjectGoalStatusInput {
  readonly projectId: string;
  readonly goalId: string;
  readonly status: ProjectGoalStatus;
}

import type { ProjectCapability } from './capabilities';
import type { ProjectTemplateKey, TemplateFinancialAccess } from './templates';

/** Serializable props for the team screen (Server -> Client). No money, ever. */
export interface TeamTemplateOption {
  readonly key: ProjectTemplateKey;
  readonly financialAccess: TemplateFinancialAccess;
  readonly capabilities: readonly ProjectCapability[];
}

export interface TeamMemberView {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly title: string | null;
  readonly templateKey: string | null;
  readonly status: 'active' | 'inactive';
  readonly capabilities: readonly string[];
}

export interface TeamCandidateView {
  readonly userId: string;
  readonly name: string;
  readonly secondary: string | null;
}

export interface ProjectTeamScreenProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly members: readonly TeamMemberView[];
  readonly candidates: readonly TeamCandidateView[];
  readonly templates: readonly TeamTemplateOption[];
  readonly viewer: {
    readonly userId: string;
    readonly isOrgAdmin: boolean;
    readonly canManage: boolean;
    readonly capabilities: readonly string[];
  };
}

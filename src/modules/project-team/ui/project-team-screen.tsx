import 'server-only';

import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import type { ProjectTeamPageData } from '../application/queries';
import type { ProjectTeamScreenProps } from '../domain/views';
import { ProjectTeamManager } from './project-team-manager';

export function toProjectTeamScreenProps(data: ProjectTeamPageData): ProjectTeamScreenProps {
  return {
    projectId: data.project.id,
    projectName: data.project.name,
    members: data.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.displayName?.trim() || member.email,
      email: member.email,
      title: member.title,
      templateKey: member.templateKey,
      status: member.status,
      capabilities: member.capabilities,
    })),
    candidates: data.candidates,
    templates: data.templates,
    viewer: data.viewer,
  };
}

/** Shared body of the Owner-app and Employee-App team routes. */
export function ProjectTeamScreen({ data }: { data: ProjectTeamPageData }) {
  return (
    <WithClientMessages extra={['projectTeam']}>
      <ProjectTeamManager {...toProjectTeamScreenProps(data)} />
    </WithClientMessages>
  );
}

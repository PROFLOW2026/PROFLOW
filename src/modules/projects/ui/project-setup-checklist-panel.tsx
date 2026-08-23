import { listPlansForProject } from '@/modules/billing-plan';
import { listExpensesForOrg } from '@/modules/expenses';
import { listProjectTeamMembers } from '@/modules/workforce';
import type { ProjectDetail } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { ProjectSetupChecklist } from './project-setup-checklist';

interface ProjectSetupChecklistPanelProps {
  readonly projectId: string;
  readonly detail: ProjectDetail;
  readonly canEdit: boolean;
}

export async function ProjectSetupChecklistPanel({
  projectId,
  detail,
  canEdit,
}: ProjectSetupChecklistPanelProps) {
  if (!canEdit || detail.project.workKind === 'job') return null;

  const setup = await withOrgContext(async (context) => {
    const [team, expenses, plans] = await Promise.all([
      listProjectTeamMembers(context, projectId).catch(() => []),
      listExpensesForOrg(context, { projectId, limit: 1 }).catch(() => ({ items: [], total: 0 })),
      listPlansForProject(context.db, context.organizationId, projectId).catch(() => []),
    ]);
    return {
      hasClient: Boolean(detail.project.clientId),
      hasContract: Boolean(detail.contract),
      hasTeam: team.length > 0,
      hasLoggedCost: expenses.items.length > 0,
      hasBillingPlan: plans.length > 0,
    };
  });

  return (
    <ProjectSetupChecklist
      projectId={projectId}
      hasClient={setup.hasClient}
      hasContract={setup.hasContract}
      hasTeam={setup.hasTeam}
      hasLoggedCost={setup.hasLoggedCost}
      hasBillingPlan={setup.hasBillingPlan}
    />
  );
}

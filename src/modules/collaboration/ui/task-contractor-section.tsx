import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { listProjectContractorGrantsForProject } from '@/modules/contractor-access';
import { listProjectContractors } from '@/modules/rfi';
import type { OrgContext } from '@/shared/auth/context';
import { withOrgContext } from '@/shared/auth/session';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { getTaskContractorPanel } from '../index';
import { EntityDiscussion } from './entity-discussion-impl';
import { showTaskContractorAssignForm } from '../domain/task-contractor-assign-visibility';
import {
  AssignTaskContractorForm,
  type TaskContractorAssignChoices,
} from './assign-task-contractor-form';
import { InternalTaskCommandForm } from './internal-task-command-form';

const EMPTY_ASSIGN_CHOICES: TaskContractorAssignChoices = {
  vendors: [],
  agreements: [],
  principals: [],
};

async function loadTaskContractorAssignChoices(
  context: OrgContext,
  projectId: string,
): Promise<TaskContractorAssignChoices> {
  const [agreements, grants] = await Promise.all([
    listProjectContractors(context.db, context.organizationId, projectId),
    listProjectContractorGrantsForProject(context, projectId),
  ]);
  const selectable = agreements.filter((row) => row.selectable);
  const vendors: TaskContractorAssignChoices['vendors'][number][] = [];
  const seenVendors = new Set<string>();
  for (const row of selectable) {
    if (seenVendors.has(row.vendorId)) continue;
    seenVendors.add(row.vendorId);
    vendors.push({ id: row.vendorId, label: row.vendorName?.trim() || row.title });
  }
  const principals: TaskContractorAssignChoices['principals'][number][] = [];
  const seenPrincipals = new Set<string>();
  for (const row of grants) {
    const vendorId = row.grant.vendorId;
    if (!vendorId || !seenVendors.has(vendorId)) continue;
    if (row.grant.status !== 'active') continue;
    if (row.principal.archivedAt || row.principal.status === 'disabled') continue;
    const key = vendorId + ':' + row.principal.id;
    if (seenPrincipals.has(key)) continue;
    seenPrincipals.add(key);
    principals.push({
      id: row.principal.id,
      vendorId,
      label: row.principal.displayName?.trim() || row.principal.username?.trim() || row.principal.id,
    });
  }
  return {
    vendors,
    agreements: selectable.map((row) => ({ id: row.id, vendorId: row.vendorId, label: row.title })),
    principals,
  };
}

export async function TaskContractorSection({ taskId }: { readonly taskId: string }) {
  const loaded = await withOrgContext(async (context) => {
    const panel = await getTaskContractorPanel(context, taskId);
    const choices =
      panel.projectId &&
      showTaskContractorAssignForm({
        eligible: panel.eligible,
        projectId: panel.projectId,
        canManage: panel.canManage,
        hasAssignment: panel.assignment !== null,
      })
        ? await loadTaskContractorAssignChoices(context, panel.projectId)
        : EMPTY_ASSIGN_CHOICES;
    return { panel, organizationId: context.organizationId, choices };
  });
  const { panel, organizationId, choices } = loaded;
  if (!panel.eligible || !panel.projectId) return null;
  const projectId = panel.projectId;

  if (!panel.assignment) {
    if (
      !showTaskContractorAssignForm({
        eligible: panel.eligible,
        projectId,
        canManage: panel.canManage,
        hasAssignment: false,
      })
    ) {
      return null;
    }
    const t = await getTranslations('collaboration');
    return (
      <MainAppPage>
        <MainAppSection>
          <Card>
            <CardHeader>
              <CardTitle>{t('contractorPanel.title')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <WithAppClientMessages extra={['collaboration']}>
                <AssignTaskContractorForm taskId={taskId} projectId={projectId} choices={choices} />
              </WithAppClientMessages>
            </CardContent>
          </Card>
        </MainAppSection>
      </MainAppPage>
    );
  }

  const [t, format] = await Promise.all([getTranslations('collaboration'), getFormatter()]);
  const assignment = panel.assignment;

  return (
    <MainAppPage>
      <MainAppSection>
        <Card>
        <CardHeader>
          <CardTitle>{t('contractorPanel.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{t(`taskStatus.${assignment.status}`)}</Badge>
            {assignment.requiresEvidence ? <Badge tone="warning">{t('contractorPanel.evidenceRequired')}</Badge> : null}
            {assignment.vendorName ? (
              <span className="text-[var(--pf-text-secondary)]">{assignment.vendorName}</span>
            ) : null}
          </div>
          {assignment.dueDate ? (
            <p className="text-xs text-[var(--pf-text-secondary)]">
              {t('contractorPanel.due', { date: assignment.dueDate })}
            </p>
          ) : null}
          {panel.canVerify || panel.canManage ? (
            <WithAppClientMessages extra={['collaboration']}>
              <InternalTaskCommandForm
                taskId={taskId}
                projectId={projectId}
                commands={assignment.availableCommands}
              />
            </WithAppClientMessages>
          ) : null}
          {panel.history.length > 0 ? (
            <ol className="mt-2 flex flex-col gap-2 border-s border-[var(--pf-border-default)] ps-4">
              {panel.history.map((event) => (
                <li key={event.id}>
                  <p className="font-medium">{t(`taskEvent.${event.action}`)}</p>
                  <p className="text-xs text-[var(--pf-text-secondary)]">
                    {format.dateTime(new Date(event.createdAt), { dateStyle: 'medium', timeStyle: 'short' })}
                    {event.actorName ? ` · ${event.actorName}` : ''}
                  </p>
                  {event.note ? <p className="whitespace-pre-wrap break-words">{event.note}</p> : null}
                </li>
              ))}
            </ol>
          ) : null}
        </CardContent>
      </Card>

      <EntityDiscussion
        organizationId={organizationId}
        projectId={projectId}
        entityType="task"
        entityId={taskId}
        viewer="internal"
      />
    
      </MainAppSection>
    </MainAppPage>
  );
}

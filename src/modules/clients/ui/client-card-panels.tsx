import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { workEntityHref } from '@/modules/search/domain/hrefs';
import { isBusinessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import type {
  ClientCrmHistoryRows,
  ClientProjectContractItem,
  ClientProjectTaskRow,
} from '../application/get-client-card-sections';

interface LinkedProjectRef {
  readonly id: string;
  readonly name: string;
  readonly workKind: string;
}

function projectHref(
  project: Pick<LinkedProjectRef, 'id' | 'workKind'>,
  projectsRouteBase: string | undefined,
  withContractsTab: boolean,
): string {
  const base = projectsRouteBase
    ? `${projectsRouteBase}/${project.id}`
    : workEntityHref(project.workKind, project.id);
  if (!withContractsTab || project.workKind === 'job' || project.workKind === 'work_order') {
    return base;
  }
  return `${base}?tab=contracts`;
}

function translated(t: (key: string) => string, key: string, known: ReadonlySet<string>): string {
  return known.has(key) ? t(key) : key;
}

const CONTRACT_TYPES = new Set(['primary', 'additional', 'secondary']);
const CONTRACT_STATUSES = new Set(['draft', 'active', 'closed', 'cancelled']);
const TASK_STATUSES = new Set(['todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled']);
const OPPORTUNITY_STAGES = new Set(['qualify', 'estimate', 'quote', 'negotiation', 'won', 'lost']);
const OPPORTUNITY_STATUSES = new Set(['open', 'won', 'lost', 'cancelled']);
const PROSPECT_STATUSES = new Set(['active', 'converted', 'inactive']);
const LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'disqualified', 'converted']);

export async function ClientContractsPanel({
  contracts,
  projects,
  projectsRouteBase,
}: {
  readonly contracts: readonly ClientProjectContractItem[];
  readonly projects: readonly LinkedProjectRef[];
  readonly projectsRouteBase?: string;
}) {
  const t = await getTranslations('clients.detail.contracts');
  const tContract = await getTranslations('projects.contracts');
  const tStatus = await getTranslations('projects.contracts.status');
  const tType = await getTranslations('projects.contracts.types');
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        {contracts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {contracts.map((contract) => {
              const project = projectsById.get(contract.projectId);
              const label =
                contract.name?.trim() ||
                contract.contractNumber?.trim() ||
                tContract('untitled');
              return (
                <li
                  key={contract.id}
                  className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 text-start">
                    {project ? (
                      <Link
                        href={projectHref(project, projectsRouteBase, true)}
                        className={textNavLinkClassName}
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="font-medium">{label}</span>
                    )}
                    {project ? (
                      <p className="text-xs text-[var(--pf-text-secondary)]">{project.name}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[var(--pf-text-secondary)]">
                    {translated(tType, contract.contractType, CONTRACT_TYPES)}
                    {' · '}
                    {translated(tStatus, contract.status, CONTRACT_STATUSES)}
                    {contract.isPrimary ? ` · ${tContract('primaryBadge')}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export async function ClientTasksPanel({
  tasks,
  projects,
  projectsRouteBase,
  tasksRouteBase,
  locale,
}: {
  readonly tasks: readonly ClientProjectTaskRow[];
  readonly projects: readonly LinkedProjectRef[];
  readonly projectsRouteBase?: string;
  readonly tasksRouteBase: string;
  readonly locale: string;
}) {
  const t = await getTranslations('clients.detail.tasks');
  const tStatus = await getTranslations('tasks.status');
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {tasks.map((task) => {
              const project = projectsById.get(task.projectId);
              return (
                <li
                  key={task.id}
                  className="flex min-w-0 flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1 text-start">
                    <Link href={`${tasksRouteBase}/${task.id}`} className={textNavLinkClassName}>
                      {task.title}
                    </Link>
                    {project ? (
                      <p className="text-xs text-[var(--pf-text-secondary)]">
                        <Link
                          href={projectHref(project, projectsRouteBase, false)}
                          className="underline-offset-2 hover:underline"
                        >
                          {project.name}
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[var(--pf-text-secondary)]">
                    {translated(tStatus, task.status, TASK_STATUSES)}
                    {task.dueDate && isBusinessDate(task.dueDate)
                      ? ` · ${t('due', { date: formatBusinessDate(task.dueDate, locale, 'short') })}`
                      : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {tasks.length >= 20 ? (
          <p className="text-xs text-[var(--pf-text-secondary)]">{t('capped')}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export async function ClientCrmHistoryPanel({ history }: { readonly history: ClientCrmHistoryRows }) {
  const t = await getTranslations('clients.detail.crm');
  const tStage = await getTranslations('crm.stages');
  const tOpportunity = await getTranslations('crm.statuses.opportunity');
  const tProspect = await getTranslations('crm.statuses.prospect');
  const tLead = await getTranslations('crm.statuses.lead');
  const empty =
    history.opportunities.length === 0 &&
    history.prospects.length === 0 &&
    history.leads.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {empty ? <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p> : null}
        {history.opportunities.length > 0 ? (
          <CrmGroup title={t('opportunities')}>
            {history.opportunities.map((row) => (
              <CrmRow
                key={row.id}
                href={`/crm/opportunities/${row.id}`}
                label={row.name}
                meta={`${translated(tStage, row.stage, OPPORTUNITY_STAGES)} · ${translated(tOpportunity, row.status, OPPORTUNITY_STATUSES)}`}
              />
            ))}
          </CrmGroup>
        ) : null}
        {history.prospects.length > 0 ? (
          <CrmGroup title={t('prospects')}>
            {history.prospects.map((row) => (
              <CrmRow
                key={row.id}
                href={`/crm/prospects/${row.id}`}
                label={row.name}
                meta={translated(tProspect, row.status, PROSPECT_STATUSES)}
              />
            ))}
          </CrmGroup>
        ) : null}
        {history.leads.length > 0 ? (
          <CrmGroup title={t('leads')}>
            {history.leads.map((row) => (
              <CrmRow
                key={row.id}
                href={`/crm/leads/${row.id}`}
                label={row.title}
                meta={translated(tLead, row.status, LEAD_STATUSES)}
              />
            ))}
          </CrmGroup>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CrmGroup({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-start text-sm font-semibold">{title}</h3>
      <ul className="flex list-none flex-col gap-2 p-0">{children}</ul>
    </div>
  );
}

function CrmRow({
  href,
  label,
  meta,
}: {
  readonly href: string;
  readonly label: string;
  readonly meta: string;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <Link href={href} className={textNavLinkClassName}>
        {label}
      </Link>
      <span className="shrink-0 text-[var(--pf-text-secondary)]">{meta}</span>
    </li>
  );
}

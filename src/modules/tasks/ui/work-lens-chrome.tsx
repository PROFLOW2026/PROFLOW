import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { listOrganizationMembers } from '@/modules/tenancy/application/members';
import { WORK_TASK_QUERY_KEYS, compactWorkTaskQuery, workTaskQueryString } from '@/modules/tasks/domain/work-task-filter-keys';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listWorkLensWorkPackageOptions } from '@/modules/tasks/application/work-lens-work-package-options';
import {
  WorkTaskFiltersBar,
  type WorkTaskClientOption,
  type WorkTaskWorkPackageOption,
} from './work-task-filters-bar';

interface WorkLensChromeProps {
  searchParams: Record<string, string | string[] | undefined>;
  clients: readonly WorkTaskClientOption[];
  taskCount: number;
  exportQuery?: Record<string, string>;
}

export async function WorkLensChrome({
  searchParams,
  clients,
  taskCount,
  exportQuery,
}: WorkLensChromeProps) {
  const t = await getTranslations('tasks');
  const compact = exportQuery ?? compactWorkTaskQuery(searchParams);
  const barParams = Object.fromEntries(
    WORK_TASK_QUERY_KEYS.map((key) => [key, compact[key]]),
  ) as Record<string, string | undefined>;

  const exportHref = `/exports/tasks-xlsx${workTaskQueryString(compact)}`;
  const [assignees, workPackages] = await Promise.all([
    withOrgContext(async (context) => {
      if (!hasPermission(context, PERMISSIONS.MEMBERS_READ)) return [];
      const members = await listOrganizationMembers(context);
      return members.map((member) => ({
        id: member.membershipId,
        name: member.displayName?.trim() || member.email,
      }));
    }),
    withOrgContext(async (context) =>
      listWorkLensWorkPackageOptions(context, compact.projectId),
    ),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex justify-end">
        <Link
          href={exportHref}
          className="inline-flex shrink-0 items-center rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm font-medium hover:bg-[var(--pf-bg-subtle)]"
        >
          {t('export.downloadXlsx')}
        </Link>
      </div>
      <WorkTaskFiltersBar
        currentParams={barParams}
        clients={clients}
        assignees={assignees}
        workPackages={workPackages as readonly WorkTaskWorkPackageOption[]}
        taskCount={taskCount}
      />
    </div>
  );
}

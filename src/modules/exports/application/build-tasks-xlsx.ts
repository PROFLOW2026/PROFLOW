import 'server-only';

import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getTranslations } from 'next-intl/server';
import { todayInTimeZone } from '@/shared/dates';
import { listAccessibleWorkLensTasksPage } from '@/modules/tasks/application/work-lens-task-list';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import type { ExportTable } from '../domain/table';
import { tablesToXlsx } from '../domain/xlsx';

export interface TasksXlsxExportResult {
  readonly body: Buffer;
  readonly fileName: string;
  readonly contentType: string;
}

export async function buildTasksXlsxExport(
  context: OrgContext,
  urlParams: Record<string, string | string[] | undefined>,
): Promise<TasksXlsxExportResult> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const t = await getTranslations({ locale: context.locale, namespace: 'tasks' });
  const today = todayInTimeZone(context.organization.timezone);
  const page = await listAccessibleWorkLensTasksPage(context, urlParams, {
    today,
    limit: 5000,
  });
  const cards = await mapTasksToCardDataForOrg(context, page.tasks);

  const table: ExportTable = {
    sheetName: t('export.sheetName'),
    headers: [
      t('export.columns.title'),
      t('export.columns.project'),
      t('export.columns.status'),
      t('export.columns.priority'),
      t('export.columns.dueDate'),
      t('export.columns.startDate'),
    ],
    rows: cards.map((task) => [
      task.title,
      task.projectName ?? '',
      t(`status.${task.status}`),
      t(`priority.${task.priority}`),
      task.dueDate ?? '',
      task.startDate ?? '',
    ]),
  };

  const body = await tablesToXlsx([table], { locale: context.locale });
  return {
    body,
    fileName: 'tasks-export.xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { listDispatchBoard, type DispatchWindow } from '@/modules/service';
import { listEmployeesForOrg } from '@/modules/workforce';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { DispatchBoard } from './dispatch-board';
import { DispatchWindowFilters } from './dispatch-window-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'service' });
  return { title: t('dispatch.title') };
}

interface DispatchPageProps {
  searchParams: Promise<{ window?: string; assignee?: string }>;
}

function resolveWindow(value: string | undefined): DispatchWindow {
  if (value === 'tomorrow' || value === 'week') return value;
  return 'today';
}

export default async function DispatchPage({ searchParams }: DispatchPageProps) {
  const [t, params, shell] = await Promise.all([
    getTranslations('service'),
    searchParams,
    getShellContext(),
  ]);

  const window = resolveWindow(params.window);
  const canDispatch = shell?.permissions.has(PERMISSIONS.DISPATCH_MANAGE) ?? false;
  const canManageService = shell?.permissions.has(PERMISSIONS.SERVICE_MANAGE) ?? false;

  const { rows, employees } = await withOrgContext(async (context) => {
    const [dispatchRows, employeeRows] = await Promise.all([
      listDispatchBoard(context, {
        window,
        assigneeEmployeeId: params.assignee || null,
      }),
      canDispatch
        ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
        : Promise.resolve([]),
    ]);
    return {
      rows: dispatchRows,
      employees: employeeRows.map((employee) => ({ id: employee.id, name: employee.name })),
    };
  });

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" data-pf-dispatch="">
      <PageHeader
        title={t('dispatch.title')}
        description={t('dispatch.description')}
        actions={
          canManageService ? (
            <Button asChild variant="secondary">
              <Link href="/work-orders/new">{t('newWorkOrder')}</Link>
            </Button>
          ) : null
        }
      />

      <DispatchWindowFilters
        initialWindow={window}
        initialAssignee={params.assignee ?? ''}
        employees={employees}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={t('dispatch.empty.title')}
          description={t('dispatch.empty.body')}
          action={
            canManageService ? (
              <Button asChild>
                <Link href="/work-orders">{t('dispatch.empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DispatchBoard
          rows={rows.map((row) => ({
            ...row,
            scheduledStartAt: row.scheduledStartAt?.toISOString() ?? null,
            scheduledEndAt: row.scheduledEndAt?.toISOString() ?? null,
          }))}
          employees={employees}
          canDispatch={canDispatch && canManageService}
        />
      )}
    </div>
  );
}

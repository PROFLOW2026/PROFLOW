import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { listBoard, type SchedulingView } from '@/modules/scheduling';
import { addDays, businessDate, todayInTimeZone } from '@/shared/dates';
import { endOfWeekSunday, startOfWeekSunday } from '@/modules/scheduling/domain/windows';
import { listProjectsForOrg } from '@/modules/projects';
import { listEmployeesForOrg } from '@/modules/workforce';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { SchedulingBoardView } from './scheduling-board';
import { CreateBookingForm, CreateUnavailabilityForm } from './scheduling-forms';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'scheduling' });
  return { title: t('title') };
}

interface SchedulingPageProps {
  searchParams: Promise<{ view?: string; from?: string }>;
}

function resolveView(value: string | undefined): SchedulingView {
  return value === 'day' ? 'day' : 'week';
}

export default async function SchedulingPage({ searchParams }: SchedulingPageProps) {
  const [t, params, shell] = await Promise.all([
    getTranslations('scheduling'),
    searchParams,
    getShellContext(),
  ]);

  if (!shell?.permissions.has(PERMISSIONS.SCHEDULING_READ)) {
    return (
      <EmptyState
        icon={CalendarRange}
        title={t('notAllowed.title')}
        description={t('notAllowed.body')}
      />
    );
  }

  const view = resolveView(params.view);
  const canManage = shell.permissions.has(PERMISSIONS.SCHEDULING_MANAGE);

  const { board, employees, projects, hrefs } = await withOrgContext(async (context) => {
    const today = todayInTimeZone(context.organization.timezone);
    const fromParam =
      params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)
        ? businessDate(params.from)
        : today;
    const from = view === 'week' ? startOfWeekSunday(fromParam) : fromParam;
    const to = view === 'week' ? endOfWeekSunday(fromParam) : from;

    const prevFrom = view === 'week' ? addDays(from, -7) : addDays(from, -1);
    const nextFrom = view === 'week' ? addDays(from, 7) : addDays(from, 1);

    try {
      const [boardResult, employeeRows, projectRows] = await Promise.all([
        listBoard(context, { from, to, view }),
        canManage
          ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
          : Promise.resolve([]),
        canManage
          ? listProjectsForOrg(context, { limit: 200 }).catch(() => [])
          : Promise.resolve([]),
      ]);

      return {
        board: boardResult,
        employees: employeeRows.map((row) => ({ id: row.id, name: row.name })),
        projects: projectRows.map((row) => ({ id: row.id, name: row.name })),
        hrefs: {
          day: `/scheduling?view=day&from=${from}`,
          week: `/scheduling?view=week&from=${from}`,
          today: `/scheduling?view=${view}&from=${today}`,
          previous: `/scheduling?view=${view}&from=${prevFrom}`,
          next: `/scheduling?view=${view}&from=${nextFrom}`,
        },
      };
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return {
          board: null,
          employees: [],
          projects: [],
          hrefs: {
            day: '/scheduling?view=day',
            week: '/scheduling?view=week',
            today: '/scheduling',
            previous: '/scheduling',
            next: '/scheduling',
          },
        };
      }
      throw error;
    }
  });

  if (!board) {
    return (
      <EmptyState
        icon={CalendarRange}
        title={t('notAllowed.title')}
        description={t('notAllowed.body')}
      />
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" data-pf-scheduling="">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant={view === 'day' ? 'primary' : 'secondary'} size="sm">
              <Link href={hrefs.day}>{t('view.day')}</Link>
            </Button>
            <Button asChild variant={view === 'week' ? 'primary' : 'secondary'} size="sm">
              <Link href={hrefs.week}>{t('view.week')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={hrefs.today}>{t('view.today')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={hrefs.previous}>{t('view.previous')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={hrefs.next}>{t('view.next')}</Link>
            </Button>
          </div>
        }
      />

      {canManage ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <CreateBookingForm employees={employees} projects={projects} />
          <CreateUnavailabilityForm employees={employees} />
        </div>
      ) : null}

      {board.employees.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={t('empty.title')}
          description={t('empty.body')}
        />
      ) : (
        <SchedulingBoardView board={board} />
      )}
    </div>
  );
}

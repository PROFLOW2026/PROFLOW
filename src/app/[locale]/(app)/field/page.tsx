import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { getFieldCockpit } from '@/modules/field/application/get-field-cockpit';
import { FieldNoteDraftForm } from '@/modules/field/ui/field-note-draft-form';
import { AttendanceClockPanel } from '@/modules/workforce/ui/attendance-clock-panel';
import {
  clockBreakEndAction,
  clockBreakStartAction,
  clockInAction,
  clockOutAction,
} from '@/app/[locale]/(app)/workforce/attendance/actions';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'fieldOps' });
  return { title: t('cockpit.title') };
}

function ActionTile({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description?: string;
}) {
  return (
    <Link href={href} className={cn(pressableCardLinkClassName, 'text-start')}>
      <span className="block font-semibold">{title}</span>
      {description ? (
        <span className="mt-1 block text-sm text-[var(--pf-text-secondary)]">{description}</span>
      ) : null}
    </Link>
  );
}

export default async function FieldHomePage() {
  const t = await getTranslations('fieldOps');
  const data = await withOrgContext((context) => getFieldCockpit(context));

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" data-pf-field-cockpit="">
      <PageHeader title={t('cockpit.title')} description={t('cockpit.description')} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {data.capabilities.fieldOpsManage ? (
          <>
            <ActionTile
              href="/field-ops/logs/new"
              title={t('cockpit.actions.log')}
              description={t('cockpit.actions.logHint')}
            />
            <ActionTile
              href="/field-ops/punch/new"
              title={t('cockpit.actions.punch')}
              description={t('cockpit.actions.punchHint')}
            />
            <ActionTile
              href="/field-ops/inspections/new"
              title={t('cockpit.actions.inspection')}
              description={t('cockpit.actions.inspectionHint')}
            />
          </>
        ) : null}
        {data.capabilities.time ? (
          <ActionTile href="/workforce/time/new" title={t('cockpit.actions.time')} />
        ) : null}
        {data.capabilities.expenses ? (
          <ActionTile
            href="/expenses/new"
            title={t('cockpit.actions.expense')}
            description={t('cockpit.actions.expenseHint')}
          />
        ) : null}
        {data.capabilities.documents ? (
          <ActionTile href="/documents" title={t('cockpit.actions.documents')} />
        ) : null}
        {data.capabilities.safety ? (
          <ActionTile href="/safety" title={t('cockpit.actions.safety')} />
        ) : null}
        {data.capabilities.service ? (
          <ActionTile href="/dispatch" title={t('cockpit.actions.dispatch')} />
        ) : null}
        <ActionTile
          href="/settings/offline-drafts"
          title={t('cockpit.actions.offline')}
          description={t('cockpit.actions.offlineHint')}
        />
      </section>

      {data.capabilities.attendance && data.attendance ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t('cockpit.attendanceTitle')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('cockpit.attendanceOnlineOnly')}</p>
          <AttendanceClockPanel
            employeeName={data.attendance.employeeName}
            workDate={data.attendance.workDate}
            presence={data.attendance.presence}
            canClockIn={data.attendance.canClockIn}
            canClockOut={data.attendance.canClockOut}
            canBreakStart={data.attendance.canBreakStart}
            canBreakEnd={data.attendance.canBreakEnd}
            linked={Boolean(data.attendance.employeeId)}
            clockInAction={clockInAction}
            clockOutAction={clockOutAction}
            clockBreakStartAction={clockBreakStartAction}
            clockBreakEndAction={clockBreakEndAction}
          />
        </section>
      ) : null}

      {data.capabilities.projects ? (
        <FieldNoteDraftForm
          projects={data.projects.map((project) => ({ id: project.id, name: project.name }))}
          defaultNoteDate={data.today}
        />
      ) : null}

      {data.dispatch.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('cockpit.todayDispatch')}</h2>
            <Link href="/dispatch" className={textNavLinkClassName}>
              {t('cockpit.viewAll')}
            </Link>
          </div>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
            {data.dispatch.map((row) => (
              <li key={row.projectId}>
                <Link
                  href={`/work-orders/${row.projectId}`}
                  className={cn(pressableCardLinkClassName, 'rounded-none border-0')}
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="mt-1 block text-sm text-[var(--pf-text-secondary)]">
                    {row.clientName ?? row.siteAddress ?? row.serviceStatus}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.workOrders.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('cockpit.assignedWorkOrders')}</h2>
            <Link href="/work-orders" className={textNavLinkClassName}>
              {t('cockpit.viewAll')}
            </Link>
          </div>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
            {data.workOrders.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/work-orders/${row.id}`}
                  className={cn(pressableCardLinkClassName, 'rounded-none border-0')}
                >
                  <span className="font-medium">{row.name}</span>
                  <span className="mt-1 block text-sm text-[var(--pf-text-secondary)]">
                    {row.assigneeName ?? row.clientName ?? row.service?.serviceStatus ?? ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.projects.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('cockpit.assignedProjects')}</h2>
            <Link href="/projects" className={textNavLinkClassName}>
              {t('cockpit.viewAll')}
            </Link>
          </div>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
            {data.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className={cn(pressableCardLinkClassName, 'rounded-none border-0')}
                >
                  <span className="font-medium">{project.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.punch.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t('cockpit.openPunch')}</h2>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
            {data.punch.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/field-ops/punch/${item.id}`}
                  className={cn(pressableCardLinkClassName, 'rounded-none border-0')}
                >
                  <span className="font-medium">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.inspections.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t('cockpit.inspections')}</h2>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
            {data.inspections.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/field-ops/inspections/${item.id}`}
                  className={cn(pressableCardLinkClassName, 'rounded-none border-0')}
                >
                  <span className="font-medium">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.dailyLogs.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t('cockpit.todayLogs')}</h2>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-lg border border-[var(--pf-border-default)]">
            {data.dailyLogs.map((log) => (
              <li key={log.id}>
                <Link
                  href={`/field-ops/logs/${log.id}`}
                  className={cn(pressableCardLinkClassName, 'rounded-none border-0')}
                >
                  <span className="line-clamp-2 text-sm">{log.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!data.dispatch.length &&
      !data.workOrders.length &&
      !data.punch.length &&
      !data.inspections.length ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('cockpit.empty')}</p>
      ) : null}
    </div>
  );
}

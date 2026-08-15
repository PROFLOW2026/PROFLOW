import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getSafetyRecordForOrg, isCorrectiveActionOverdue, SAFETY_RECORD_DOCUMENT_OWNER } from '@/modules/safety';
import { safetyActionStatusShape, safetyRecordStatusShape, safetySeverityShape } from '@/modules/safety/ui';
import { listProjectsForOrg } from '@/modules/projects';
import { listOrganizationMembers } from '@/modules/tenancy';
import { todayInTimeZone } from '@/shared/dates/dates';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { SafetyRecordForm } from '../safety-record-form';
import { CorrectiveActionForm, CorrectiveActionStatusForm } from '../corrective-action-form';
import { AcknowledgeAttendeeButton, ToolboxAttendeeForm } from '../toolbox-attendees-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'safety' });
  return { title: t('detail.title') };
}

export default async function SafetyRecordDetailPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const t = await getTranslations('safety');
  const locale = await getLocale();

  const loaded = await withOrgContext(async (context) => {
    try {
      const record = await getSafetyRecordForOrg(context, recordId);
      const [projects, members, documentsPanel] = await Promise.all([
        listProjectsForOrg(context, {}).catch(() => []),
        listOrganizationMembers(context).catch(() => []),
        getEntityDocumentPanelData(
          context,
          SAFETY_RECORD_DOCUMENT_OWNER,
          recordId,
        ).catch(() => null),
      ]);
      return {
        record,
        projects: projects.map((project) => ({ id: project.id, name: project.name })),
        members: members
          .filter((member) => member.status === 'active')
          .map((member) => ({
            userId: member.userId,
            label: member.displayName?.trim() || member.email,
          })),
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.SAFETY_MANAGE),
        today: todayInTimeZone(context.organization.timezone),
      };
    } catch {
      return null;
    }
  });

  if (!loaded) notFound();

  const { record, projects, members, documentsPanel, canManage, today } = loaded;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={record.title}
        description={t(`types.${record.recordType}`)}
        breadcrumb={
          <Link href="/safety" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        meta={
          <>
            <StatusBadge
              shape={safetyRecordStatusShape(record.status)}
              label={t(`status.${record.status}`)}
            />
            <StatusBadge
              shape={safetySeverityShape(record.severity)}
              label={t(`severity.${record.severity}`)}
            />
            <span className="pf-ltr-island text-sm text-[var(--pf-text-secondary)]" dir="ltr">
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                record.occurredAt,
              )}
            </span>
          </>
        }
      />

      {canManage ? (
        <SafetyRecordForm
          mode="edit"
          record={record}
          projects={projects}
          defaultOccurredAt={record.occurredAt}
        />
      ) : (
        <dl className="grid max-w-lg gap-3 text-sm">
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('fields.description')}</dt>
            <dd className="mt-1 whitespace-pre-wrap">{record.description}</dd>
          </div>
        </dl>
      )}

      <section className="flex max-w-2xl flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
        <h2 className="font-semibold">{t('detail.actionsTitle')}</h2>
        {record.actions.length === 0 ? (
          <EmptyState title={t('detail.noActions')} size="sm" />
        ) : (
          <ul className="flex flex-col gap-3">
            {record.actions.map((action) => {
              const overdue = isCorrectiveActionOverdue(action, today);
              return (
                <li
                  key={action.id}
                  className="rounded-md border border-[var(--pf-border-default)] p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{action.title}</p>
                    <StatusBadge
                      shape={safetyActionStatusShape(action.status, overdue)}
                      label={overdue ? t('overdue') : t(`status.${action.status}`)}
                    />
                  </div>
                  {action.dueDate ? (
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      {t('fields.dueDate')}:{' '}
                      <span className="pf-ltr-island" dir="ltr">
                        {action.dueDate}
                      </span>
                    </p>
                  ) : null}
                  {canManage ? <CorrectiveActionStatusForm action={action} today={today} /> : null}
                </li>
              );
            })}
          </ul>
        )}
        {canManage ? (
          <CorrectiveActionForm safetyRecordId={record.id} members={members} today={today} />
        ) : null}
      </section>

      {record.recordType === 'toolbox_talk' ? (
        <section className="flex max-w-2xl flex-col gap-4 rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-semibold">{t('detail.toolboxTitle')}</h2>
          {record.toolboxTalk ? (
            <p className="text-sm">
              {record.toolboxTalk.topic}
              {' · '}
              <span className="pf-ltr-island" dir="ltr">
                {record.toolboxTalk.talkDate}
              </span>
            </p>
          ) : null}
          {record.attendees.length === 0 ? (
            <EmptyState title={t('detail.noAttendees')} size="sm" />
          ) : (
            <ul className="flex flex-col gap-2">
              {record.attendees.map((attendee) => (
                <li
                  key={attendee.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{attendee.attendeeName}</p>
                    <p className="text-sm text-[var(--pf-text-secondary)]">
                      {attendee.acknowledgedAt
                        ? `${t('fields.acknowledged')} · ${attendee.acknowledgedAt.toISOString()}`
                        : t('fields.notAcknowledged')}
                    </p>
                  </div>
                  {canManage ? (
                    <AcknowledgeAttendeeButton attendee={attendee} safetyRecordId={record.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canManage ? <ToolboxAttendeeForm safetyRecordId={record.id} /> : null}
        </section>
      ) : null}

      {documentsPanel ? (
        <DocumentAttachments
          ownerType={SAFETY_RECORD_DOCUMENT_OWNER}
          ownerId={record.id}
          documents={documentsPanel.documents}
          linkCandidates={documentsPanel.linkCandidates}
          canRead={documentsPanel.canRead}
          canManage={documentsPanel.canManage && canManage}
          storageConfigured={documentsPanel.storageConfigured}
        />
      ) : null}
    </div>
  );
}

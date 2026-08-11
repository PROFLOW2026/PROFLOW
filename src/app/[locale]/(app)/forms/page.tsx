import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import {
  FORM_OWNER_TYPES,
  FORM_SUBMISSION_STATUSES,
  listFormSubmissionsForOrg,
  type FormOwnerType,
  type FormSubmissionStatus,
} from '@/modules/forms';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function statusShape(status: FormSubmissionStatus): StatusShape {
  switch (status) {
    case 'draft':
      return 'pending';
    case 'submitted':
      return 'completed';
    case 'void':
      return 'void';
    default:
      return 'archived';
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forms');
  return { title: t('title') };
}

export default async function FormsListPage({
  searchParams,
}: {
  searchParams: Promise<{ ownerType?: string; ownerId?: string; status?: string }>;
}) {
  const t = await getTranslations('forms');
  const locale = await getLocale();
  const params = await searchParams;

  const ownerType =
    params.ownerType && (FORM_OWNER_TYPES as readonly string[]).includes(params.ownerType)
      ? (params.ownerType as FormOwnerType)
      : undefined;
  const ownerId = params.ownerId?.trim() || undefined;
  const status =
    params.status && (FORM_SUBMISSION_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as FormSubmissionStatus)
      : undefined;

  const data = await withOrgContext(async (context) => {
    const submissions = await listFormSubmissionsForOrg(context, {
      ownerType,
      ownerId,
      status,
    });
    return {
      submissions,
      canManage: hasPermission(context, PERMISSIONS.FORMS_MANAGE),
      canManageTemplates: hasPermission(context, PERMISSIONS.FORMS_MANAGE),
    };
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          data.canManage ? (
            <Button asChild>
              <Link href="/forms/new">{t('list.new')}</Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-3 text-sm">
        {data.canManageTemplates ? (
          <Link href="/settings/forms" className={textNavLinkClassName}>
            {t('list.templatesLink')}
          </Link>
        ) : null}
      </div>

      {data.submissions.length === 0 ? (
        <EmptyState
          title={t('list.empty.title')}
          description={t('list.empty.body')}
          action={
            data.canManage ? (
              <Button asChild>
                <Link href="/forms/new">{t('list.empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.submissions.map((submission) => (
            <li
              key={submission.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3"
            >
              <div className="min-w-0">
                <Link href={`/forms/${submission.id}`} className={textNavLinkClassName}>
                  {submission.templateName}
                </Link>
                <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                  {t(`ownerTypes.${submission.ownerType}`)} · {submission.ownerId.slice(0, 8)}…
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--pf-text-secondary)]">
                <StatusBadge
                  shape={statusShape(submission.status)}
                  label={t(`status.${submission.status}`)}
                />
                <time dateTime={submission.updatedAt.toISOString()}>
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    submission.updatedAt,
                  )}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

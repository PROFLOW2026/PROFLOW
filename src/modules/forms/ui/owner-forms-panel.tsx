'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type {
  FormOwnerType,
  FormSubmissionListItem,
  FormSubmissionStatus,
  FormTemplateRecord,
} from '@/modules/forms/domain/types';
import { startOwnerSubmissionAction, type FormsActionState } from './owner-forms-actions';

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

export function OwnerFormsPanel({
  ownerType,
  ownerId,
  templates,
  submissions,
  canManage,
}: {
  ownerType: FormOwnerType;
  ownerId: string;
  templates: readonly FormTemplateRecord[];
  submissions: readonly FormSubmissionListItem[];
  canManage: boolean;
}) {
  const t = useTranslations('forms');
  const [state, action, pending] = useActionState(
    startOwnerSubmissionAction,
    {} as FormsActionState,
  );

  return (
    <section className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('ownerPanel.title')}</h2>
        <Link
          href={`/forms?ownerType=${ownerType}&ownerId=${ownerId}`}
          className={textNavLinkClassName}
        >
          {t('ownerPanel.viewAll')}
        </Link>
      </div>

      <Alert tone="info" className="mt-3">
        {t('acknowledgementDisclaimer')}
      </Alert>

      {canManage && templates.length > 0 ? (
        <form action={action} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="ownerType" value={ownerType} />
          <input type="hidden" name="ownerId" value={ownerId} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          <Field label={t('ownerPanel.chooseTemplate')} className="min-w-0 flex-1">
            {(props) => (
              <select
                id={props.id}
                name="templateId"
                required
                defaultValue={templates[0]?.id}
                className="flex h-10 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Button type="submit" loading={pending}>
            {t('ownerPanel.start')}
          </Button>
        </form>
      ) : null}

      {submissions.length === 0 ? (
        <div className="mt-4">
          <EmptyState title={t('ownerPanel.empty')} />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {submissions.slice(0, 8).map((submission) => (
            <li
              key={submission.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <Link href={`/forms/${submission.id}`} className={textNavLinkClassName}>
                {submission.templateName}
              </Link>
              <StatusBadge
                shape={statusShape(submission.status)}
                label={t(`status.${submission.status}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

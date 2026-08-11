import { getTranslations } from 'next-intl/server';
import {
  listFormSubmissionsForOwner,
  listFormTemplatesForOrg,
  type FormOwnerType,
} from '@/modules/forms';
import { OwnerFormsPanel } from '@/modules/forms/ui/owner-forms-panel';
import { withOrgContext } from '@/shared/auth/session';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

/** Project / job / work-order overview panel for field forms. */
export async function ProjectFormsPanel({
  ownerType,
  ownerId,
}: {
  ownerType: FormOwnerType;
  ownerId: string;
}) {
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.FORMS_READ)) return null;
    const [submissions, templates] = await Promise.all([
      listFormSubmissionsForOwner(context, ownerType, ownerId),
      listFormTemplatesForOrg(context, { enabledOnly: true }),
    ]);
    return {
      submissions,
      templates,
      canManage: hasAnyPermission(context, [
        PERMISSIONS.FORMS_SUBMIT,
        PERMISSIONS.FORMS_MANAGE,
      ]),
    };
  }).catch(() => null);

  if (!data) return null;

  return (
    <WithClientMessages extra={['forms']}>
      <OwnerFormsPanel
        ownerType={ownerType}
        ownerId={ownerId}
        templates={data.templates}
        submissions={data.submissions}
        canManage={data.canManage}
      />
    </WithClientMessages>
  );
}

/** Lightweight count strip when full panel is not needed. */
export async function ProjectFormsSummaryLink({
  ownerType,
  ownerId,
}: {
  ownerType: FormOwnerType;
  ownerId: string;
}) {
  const t = await getTranslations('forms.projectSummary');
  const count = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.FORMS_READ)) return null;
    const rows = await listFormSubmissionsForOwner(context, ownerType, ownerId);
    return rows.length;
  }).catch(() => null);

  if (count === null) return null;

  return (
    <p className="text-sm text-[var(--pf-text-secondary)]">
      {t('title')}: {count} {t('count')}
    </p>
  );
}

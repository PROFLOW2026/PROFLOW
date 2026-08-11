import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  createFormSubmission,
  FORM_OWNER_TYPES,
  listFormTemplatesForOrg,
} from '@/modules/forms';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forms');
  return { title: t('new.title') };
}

async function createSubmissionAction(formData: FormData) {
  'use server';
  const locale = await getLocale();
  const templateId = String(formData.get('templateId') ?? '').trim();
  const ownerType = String(formData.get('ownerType') ?? '').trim();
  const ownerId = String(formData.get('ownerId') ?? '').trim();
  const offlineClientId = String(formData.get('offlineClientId') ?? '').trim() || null;

  if (
    !templateId ||
    !ownerId ||
    !(FORM_OWNER_TYPES as readonly string[]).includes(ownerType)
  ) {
    return;
  }

  try {
    const submission = await withOrgContext((context) =>
      createFormSubmission(context, {
        templateId,
        ownerType: ownerType as (typeof FORM_OWNER_TYPES)[number],
        ownerId,
        offlineClientId,
      }),
    );
    redirect({ href: `/forms/${submission.id}`, locale });
  } catch (error) {
    if (error instanceof AppError) return;
    throw error;
  }
}

export default async function NewFormSubmissionPage({
  searchParams,
}: {
  searchParams: Promise<{
    ownerType?: string;
    ownerId?: string;
    templateId?: string;
  }>;
}) {
  const t = await getTranslations('forms');
  const params = await searchParams;

  const data = await withOrgContext(async (context) => {
    const templates = await listFormTemplatesForOrg(context, { enabledOnly: true });
    return { templates };
  });

  const defaultOwnerType =
    params.ownerType && (FORM_OWNER_TYPES as readonly string[]).includes(params.ownerType)
      ? params.ownerType
      : 'project';

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <PageHeader title={t('new.title')} />
      <Alert tone="info">{t('acknowledgementDisclaimer')}</Alert>

      {data.templates.length === 0 ? (
        <Alert tone="warning">
          {t('new.noTemplates')}{' '}
          <Link href="/settings/forms" className={textNavLinkClassName}>
            {t('list.templatesLink')}
          </Link>
        </Alert>
      ) : (
        <form action={createSubmissionAction} className="flex flex-col gap-4">
          <Field label={t('new.template')} required>
            {(props) => (
              <select
                id={props.id}
                name="templateId"
                required
                defaultValue={params.templateId ?? data.templates[0]?.id}
                className="flex h-10 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              >
                {data.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label={t('new.ownerType')} required>
            {(props) => (
              <select
                id={props.id}
                name="ownerType"
                required
                defaultValue={defaultOwnerType}
                className="flex h-10 w-full rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-3 text-sm"
              >
                {FORM_OWNER_TYPES.map((ownerType) => (
                  <option key={ownerType} value={ownerType}>
                    {t(`ownerTypes.${ownerType}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label={t('new.ownerId')} required description={t('new.ownerIdHint')}>
            {(props) => (
              <Input
                {...props}
                name="ownerId"
                required
                defaultValue={params.ownerId ?? ''}
                dir="ltr"
                className="font-mono text-sm"
              />
            )}
          </Field>

          <Button type="submit">{t('new.start')}</Button>
        </form>
      )}
    </div>
  );
}

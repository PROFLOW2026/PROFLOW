import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ContextualBackLink } from '@/components/ui/contextual-back-link';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { RecurringDraftForm } from '@/modules/recurring-drafts/ui/draft-form';
import { writableDraftKinds } from '@/modules/recurring-drafts';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link, redirect } from '@/shared/i18n/navigation';
import { createRecurringDraftAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recurringDrafts' });
  return { title: t('create.title') };
}

export default async function NewRecurringDraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string }>;
}) {
  const [{ locale }, t, tCommon, search] = await Promise.all([
    params,
    getTranslations('recurringDrafts'),
    getTranslations('common'),
    searchParams,
  ]);

  const { writableKinds, vendors, projects, defaultCurrency, defaultNextRunDate } =
    await withOrgContext(async (context) => {
      const kinds = writableDraftKinds(context);
      const vendorRows = hasPermission(context, PERMISSIONS.VENDORS_READ)
        ? await listVendorsForOrg(context, { status: 'active' }).catch(() => [])
        : [];
      const projectRows = hasPermission(context, PERMISSIONS.PROJECTS_READ)
        ? await listProjectsForOrg(context).catch(() => [])
        : [];
      return {
        writableKinds: kinds,
        vendors: vendorRows.map((vendor) => ({ id: vendor.id, name: vendor.name })),
        projects: projectRows.map((project) => ({ id: project.id, name: project.name })),
        defaultCurrency: context.organization.baseCurrency,
        defaultNextRunDate: todayInTimeZone(context.organization.timezone),
      };
    });

  if (writableKinds.length === 0) {
    redirect({ href: '/recurring-drafts', locale });
  }

  const preferredKind = search.kind;
  const initialKind = writableKinds.find((kind) => kind === preferredKind) ?? writableKinds[0];

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <ContextualBackLink href="/recurring-drafts">
            {t('backToRecurringExpenses')}
          </ContextualBackLink>
        }
        actions={
          <Link
            href="/recurring-drafts"
            className="inline-flex min-h-11 items-center text-sm text-[var(--pf-text-brand)] underline-offset-4 hover:underline"
          >
            {tCommon('actions.cancel')}
          </Link>
        }
      />
      <RecurringDraftForm
        mode="create"
        action={createRecurringDraftAction}
        defaultCurrency={defaultCurrency}
        defaultNextRunDate={defaultNextRunDate}
        writableKinds={writableKinds}
        vendors={vendors}
        projects={projects}
        initial={
          initialKind
            ? {
                title: '',
                draftKind: initialKind,
                frequency: 'monthly',
                intervalCount: 1,
                nextRunDate: defaultNextRunDate,
                endDate: null,
              }
            : undefined
        }
      />
    </div>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ContextualBackLink } from '@/components/ui/contextual-back-link';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { getRecurringDraftDetail, canManageDraftKind } from '@/modules/recurring-drafts';
import { RecurringDraftForm } from '@/modules/recurring-drafts/ui/draft-form';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link, redirect } from '@/shared/i18n/navigation';
import { updateRecurringDraftAction } from '../../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recurringDrafts' });
  return { title: t('edit.title') };
}

export default async function EditRecurringDraftPage({
  params,
}: {
  params: Promise<{ locale: string; draftId: string }>;
}) {
  const { draftId, locale } = await params;
  const [t, tCommon] = await Promise.all([
    getTranslations('recurringDrafts'),
    getTranslations('common'),
  ]);

  const loaded = await withOrgContext(async (context) => {
    try {
      const detail = await getRecurringDraftDetail(context, draftId);
      if (!canManageDraftKind(context, detail.draft.draftKind) || detail.draft.status === 'ended') {
        return { forbidden: true as const };
      }
      const vendorRows = hasPermission(context, PERMISSIONS.VENDORS_READ)
        ? await listVendorsForOrg(context, { status: 'active' }).catch(() => [])
        : [];
      const projectRows = hasPermission(context, PERMISSIONS.PROJECTS_READ)
        ? await listProjectsForOrg(context).catch(() => [])
        : [];
      return {
        forbidden: false as const,
        detail,
        vendors: vendorRows.map((vendor) => ({ id: vendor.id, name: vendor.name })),
        projects: projectRows.map((project) => ({ id: project.id, name: project.name })),
        defaultCurrency: context.organization.baseCurrency,
        defaultNextRunDate: todayInTimeZone(context.organization.timezone),
      };
    } catch {
      return null;
    }
  });

  if (!loaded) notFound();
  if (loaded.forbidden) {
    redirect({ href: `/recurring-drafts/${draftId}`, locale });
    return null;
  }

  const { detail, vendors, projects, defaultCurrency, defaultNextRunDate } = loaded;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('edit.title')}
        description={detail.draft.title}
        breadcrumb={
          <ContextualBackLink href={`/recurring-drafts/${detail.draft.id}`}>
            {t('backToDraftDetail')}
          </ContextualBackLink>
        }
        actions={
          <Link
            href={`/recurring-drafts/${detail.draft.id}`}
            className="inline-flex min-h-11 items-center text-sm text-[var(--pf-text-brand)] underline-offset-4 hover:underline"
          >
            {tCommon('actions.cancel')}
          </Link>
        }
      />
      <RecurringDraftForm
        mode="edit"
        action={updateRecurringDraftAction}
        defaultCurrency={defaultCurrency}
        defaultNextRunDate={defaultNextRunDate}
        writableKinds={[detail.draft.draftKind]}
        vendors={vendors}
        projects={projects}
        initial={{
          draftId: detail.draft.id,
          title: detail.draft.title,
          draftKind: detail.draft.draftKind,
          frequency: detail.draft.frequency,
          intervalCount: detail.draft.intervalCount,
          nextRunDate: detail.draft.nextRunDate,
          endDate: detail.draft.endDate,
          autoFinalizeExpense: detail.draft.autoFinalizeExpense,
          managerialCostKind: detail.draft.managerialCostKind,
          payload: detail.payload,
        }}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import {
  listOcrCandidates,
  getOcrProviderStatus,
  isOcrReviewUiAllowed,
  OCR_REVIEW_SURFACE_STATUSES,
} from '@/modules/ocr';
import { getOcrFeatureMode } from '@/modules/ocr/domain/feature-gate';
import { OcrReviewPanelLazy } from '@/modules/ocr/ui/ocr-review-panel-lazy';
import { listVendorsForOrg } from '@/modules/vendors';
import { getOrganizationTaxId } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link, redirect } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { OcrDraftTarget, OcrWorkflowContext } from '@/modules/ocr/domain/types';

function parseWorkflow(raw: string | undefined): OcrWorkflowContext {
  if (raw === 'expense' || raw === 'vendor_bill' || raw === 'vendor_credit' || raw === 'general') {
    return raw;
  }
  return 'general';
}

function defaultTargetFor(workflow: OcrWorkflowContext): OcrDraftTarget {
  if (workflow === 'vendor_bill') return 'vendor_bill';
  if (workflow === 'vendor_credit') return 'vendor_credit';
  return 'expense';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isOcrReviewUiAllowed()) {
    return { title: 'Expenses' };
  }
  const t = await getTranslations({ locale, namespace: 'documents' });
  return { title: t('ocr.title') };
}

export default async function OcrReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>;
}) {
  if (!isOcrReviewUiAllowed()) {
    redirect({ href: '/expenses', locale: await getLocale() });
  }

  const [{ target }, t, tOcr] = await Promise.all([
    searchParams,
    getTranslations('documents'),
    getTranslations('documents.ocr'),
  ]);
  const workflow = parseWorkflow(target);
  const featureMode = getOcrFeatureMode();

  const data = await withOrgContext(async (context) => {
    try {
      const status = getOcrProviderStatus(context);
      const jobs = await listOcrCandidates(context, {
        status: [...OCR_REVIEW_SURFACE_STATUSES],
      });
      let vendors: { id: string; name: string }[] = [];
      try {
        vendors = (await listVendorsForOrg(context, { status: 'active' })).map((vendor) => ({
          id: vendor.id,
          name: vendor.name,
        }));
      } catch {
        vendors = [];
      }
      const organizationTaxId = await getOrganizationTaxId(context.db, context.organizationId);
      return {
        allowed: true as const,
        status,
        jobs,
        vendors,
        organizationId: context.organizationId,
        organizationTaxId,
        canManageDocuments: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
        canCreateExpenses: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
        canManageAp: hasPermission(context, PERMISSIONS.AP_MANAGE),
      };
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return { allowed: false as const };
      }
      throw error;
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={tOcr('title')}
        description={`${tOcr(`configurationState.${featureMode}`)} ${tOcr('description')}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/documents/ocr-review/history"
              className={cn(textNavLinkClassName, 'rounded-sm text-sm font-medium')}
            >
              {tOcr('historyLink')}
            </Link>
            <Link
              href="/documents"
              className={cn(textNavLinkClassName, 'rounded-sm text-sm font-medium')}
            >
              {t('title')}
            </Link>
          </div>
        }
      />

      {!data.allowed ? (
        <Alert tone="warning">{tOcr('notAllowed')}</Alert>
      ) : (
        <OcrReviewPanelLazy
          initialStatus={data.status}
          initialJobs={data.jobs}
          vendors={data.vendors}
          organizationId={data.organizationId}
          organizationTaxId={data.organizationTaxId}
          defaultTarget={defaultTargetFor(workflow)}
          workflow={workflow}
          canManageDocuments={data.canManageDocuments}
          canCreateExpenses={data.canCreateExpenses}
          canManageAp={data.canManageAp}
        />
      )}
    </div>
  );
}

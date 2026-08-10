import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { listOcrCandidates, getOcrProviderStatus, isOcrReviewUiAllowed } from '@/modules/ocr';
import { OcrReviewPanelLazy } from '@/modules/ocr/ui/ocr-review-panel-lazy';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link, redirect } from '@/shared/i18n/navigation';

/**
 * OCR review — gated OFF by default.
 * Stub / disabled modes never present “working OCR” to customers.
 */
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

export default async function OcrReviewPage() {
  if (!isOcrReviewUiAllowed()) {
    redirect({ href: '/expenses', locale: await getLocale() });
  }

  const t = await getTranslations('documents');
  const tOcr = await getTranslations('documents.ocr');

  const data = await withOrgContext(async (context) => {
    try {
      const status = getOcrProviderStatus(context);
      const jobs = await listOcrCandidates(context, {
        status: ['needs_review', 'failed', 'rejected'],
      });
      return {
        allowed: true as const,
        status,
        jobs,
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
        description={tOcr('description')}
        actions={
          <Link
            href="/documents"
            className="rounded-sm text-sm font-medium text-[var(--pf-text-brand)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
          >
            {t('title')}
          </Link>
        }
      />

      {!data.allowed ? (
        <Alert tone="warning">{tOcr('notAllowed')}</Alert>
      ) : (
        <OcrReviewPanelLazy
          initialStatus={data.status}
          initialJobs={data.jobs}
          canManageDocuments={data.canManageDocuments}
          canCreateExpenses={data.canCreateExpenses}
          canManageAp={data.canManageAp}
        />
      )}
    </div>
  );
}

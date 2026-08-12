import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import {
  listOcrCandidates,
  isOcrReviewUiAllowed,
  OCR_REVIEW_HISTORY_STATUSES,
} from '@/modules/ocr';
import { OcrReviewHistory } from '@/modules/ocr/ui/ocr-review-history';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link, redirect } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isOcrReviewUiAllowed()) {
    return { title: 'Expenses' };
  }
  const t = await getTranslations({ locale, namespace: 'documents.ocr' });
  return { title: t('historyTitle') };
}

export default async function OcrReviewHistoryPage() {
  if (!isOcrReviewUiAllowed()) {
    redirect({ href: '/expenses', locale: await getLocale() });
  }

  const [tOcr] = await Promise.all([getTranslations('documents.ocr')]);

  const data = await withOrgContext(async (context) => {
    try {
      const jobs = await listOcrCandidates(context, {
        status: [...OCR_REVIEW_HISTORY_STATUSES],
      });
      return { allowed: true as const, jobs };
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return { allowed: false as const, jobs: [] };
      }
      throw error;
    }
  });

  return (
    <div className="flex flex-col gap-6" data-pf-ocr-history-page>
      <PageHeader
        title={tOcr('historyTitle')}
        description={tOcr('historyDescription')}
        actions={
          <Link
            href="/documents/ocr-review"
            className={cn(textNavLinkClassName, 'rounded-sm text-sm font-medium')}
          >
            {tOcr('historyBackToQueue')}
          </Link>
        }
      />

      {!data.allowed ? (
        <Alert tone="warning">{tOcr('notAllowed')}</Alert>
      ) : (
        <OcrReviewHistory jobs={data.jobs} />
      )}
    </div>
  );
}

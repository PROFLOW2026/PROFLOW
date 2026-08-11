import { isOcrIngestionEnabled } from '@/modules/ocr/domain/feature-gate';
import { Link } from '@/shared/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';

export async function OcrEntryLink({
  workflow,
}: {
  workflow: 'expense' | 'vendor_bill' | 'vendor_credit' | 'general';
}) {
  if (!isOcrIngestionEnabled()) return null;
  const t = await getTranslations('documents.ocr');
  const href =
    workflow === 'general'
      ? '/documents/ocr-review'
      : `/documents/ocr-review?target=${workflow}`;
  return (
    <Button asChild variant="secondary">
      <Link href={href}>{t('scanCta')}</Link>
    </Button>
  );
}

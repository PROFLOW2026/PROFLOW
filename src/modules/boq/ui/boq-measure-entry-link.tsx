import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { getFieldMeasureEntry } from '../application/get-field-measure-workspace';

export async function BoqMeasureEntryLink({ projectId }: { projectId: string }) {
  const t = await getTranslations('boq.measure');
  const entry = await withOrgContext((context) => getFieldMeasureEntry(context, projectId)).catch(
    () => null,
  );
  if (!entry) return null;

  return (
    <Button asChild size="lg">
      <Link href={entry.href}>{t('link')}</Link>
    </Button>
  );
}

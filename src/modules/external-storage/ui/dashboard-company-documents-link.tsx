import { FileText } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { Button } from '@/components/ui/button';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/**
 * Quick access to the existing org file browser — no duplicate UI.
 */
export async function DashboardCompanyDocumentsLink() {
  const t = await getTranslations('dashboard');
  const allowed = await withOrgContext(async (context) =>
    hasPermission(context, PERMISSIONS.DOCUMENTS_READ),
  );
  if (!allowed) return null;

  return (
    <Button
      asChild
      variant="secondary"
      size="sm"
      className="w-fit max-w-full"
      data-pf-dashboard-company-documents=""
    >
      <Link href="/company-files" prefetch={false}>
        <FileText className="size-4 shrink-0" aria-hidden />
        {t('companyDocuments')}
      </Link>
    </Button>
  );
}

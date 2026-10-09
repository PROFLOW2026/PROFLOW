import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listPortalTenders } from '@/modules/contractor-procurement';
import { requireExternalContext } from '@/modules/contractor-access';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorTendersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const organizationId = context.grants[0]?.organizationId;
  if (!organizationId) return null;
  const t = await getTranslations('awards');
  const packages = await listPortalTenders(context, { organizationId, projectId });

  return (
    <WithPortalClientMessages extra={['awards']}>
      <div className="flex flex-col gap-4">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />
        <ul className="flex flex-col gap-2">
          {packages.map((pkg) => (
            <li key={pkg.id} className="rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm">
              <p className="font-medium">{pkg.title}</p>
              <p className="text-[var(--pf-text-muted)]">{pkg.tradeKey}</p>
            </li>
          ))}
        </ul>
      </div>
    </WithPortalClientMessages>
  );
}

import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listPortalTenders } from '@/modules/contractor-procurement';
import { requireExternalContext } from '@/modules/contractor-access';
import { resolveContractorProjectOrganization } from '@/modules/defects';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorTendersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));
  const t = await getTranslations('awards');
  const packages = await listPortalTenders(context, { organizationId, projectId });
  const base = `/contractor/projects/${projectId}/tenders`;

  return (
    <WithPortalClientMessages extra={['awards']}>
      <div className="flex flex-col gap-4">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />
        <ul className="flex flex-col gap-2">
          {packages.map((pkg) => (
            <li key={pkg.id}>
              <Link
                href={`${base}/${pkg.id}`}
                className="block rounded-md border border-[var(--pf-border)] px-3 py-2 text-sm hover:bg-[var(--pf-action-subtle-hover)]"
              >
                <p className="font-medium">{pkg.title}</p>
                <p className="text-[var(--pf-text-muted)]">{pkg.tradeKey}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </WithPortalClientMessages>
  );
}

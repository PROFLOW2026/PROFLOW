import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getPortalHandover } from '@/modules/contractor-closeout';
import { requireExternalContext } from '@/modules/contractor-access';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorHandoverPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const context = await requireExternalContext();
  const organizationId = context.grants[0]?.organizationId;
  if (!organizationId) return null;
  const t = await getTranslations('handover');
  const { closeouts } = await getPortalHandover(context, { organizationId, projectId });

  return (
    <WithClientMessages extra={['handover']}>
      <div className="flex flex-col gap-4">
        <PageHeader title={t('portal.title')} description={t('portal.description')} />
        {closeouts.map(({ closeout, items }) => (
          <section key={closeout.id} className="rounded-md border border-[var(--pf-border)] p-3 text-sm">
            <h2 className="font-medium">{t('portal.checklist')}</h2>
            <ul className="mt-2 flex flex-col gap-1">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-2">
                  <span>{item.title}</span>
                  <span>{t(`itemStatus.${item.status}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </WithClientMessages>
  );
}

import { getTranslations } from 'next-intl/server';
import { MainAppPage } from '@/components/patterns/main-app';
import { PageHeader } from '@/components/ui/page-header';
import { CrmNewLeadForm } from '@/modules/crm/ui/crm-new-lead-form';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function CrmNewLeadView() {
  const t = await getTranslations('crm');

  return (
    <MainAppPage>
      <PageHeader
        title={t('lead.new')}
        breadcrumb={
          <Link href="/crm/leads" className={textNavLinkMutedClassName}>
            {t('nav.leads')}
          </Link>
        }
      />
      <CrmNewLeadForm />
    </MainAppPage>
  );
}

import { getTranslations } from 'next-intl/server';
import { MainAppPage } from '@/components/patterns/main-app';
import { PageHeader } from '@/components/ui/page-header';
import { CrmNewProspectForm } from '@/modules/crm/ui/crm-new-prospect-form';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function CrmNewProspectView() {
  const t = await getTranslations('crm');

  return (
    <MainAppPage>
      <PageHeader
        title={t('prospect.new')}
        breadcrumb={
          <Link href="/crm/prospects" className={textNavLinkMutedClassName}>
            {t('nav.prospects')}
          </Link>
        }
      />
      <CrmNewProspectForm />
    </MainAppPage>
  );
}

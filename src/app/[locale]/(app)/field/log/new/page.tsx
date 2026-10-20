import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import { redirect } from '@/shared/i18n/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectsForOrg } from '@/modules/projects';
import { findProjectDeliveryProfile } from '@/modules/project-profile/application/read-delivery-profile';
import { resolveDailyLogHref } from '@/modules/project-workspace/domain/daily-log-target';
import { getModuleVisibility } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';

export default async function FieldLogChooserPage() {
  const t = await getTranslations('fieldOps');
  const locale = await getLocale();

  const choices = await withOrgContext(async (context) => {
    const modules = await getModuleVisibility(context);
    const projects = (await listProjectsForOrg(context, {})).filter((p) => p.status === 'active');
    const rows: { projectId: string; name: string; href: string; kind: 'site_log' | 'field_ops' }[] =
      [];
    for (const project of projects) {
      const deliveryProfile = await findProjectDeliveryProfile(context, project.id);
      const href = resolveDailyLogHref({
        deliveryProfile,
        modules: { field_ops: modules.field_ops },
        projectId: project.id,
      });
      if (!href) continue;
      rows.push({
        projectId: project.id,
        name: project.name,
        href,
        kind: href.includes('/site-log') ? 'site_log' : 'field_ops',
      });
    }
    return rows;
  });

  if (choices.length === 1) {
    redirect({ href: choices[0]!.href, locale });
  }

  return (
    <MainAppPage>
      <PageHeader title={t('fieldLogChooser.title')} description={t('fieldLogChooser.description')} />
      <MainAppSection>
        {choices.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('fieldLogChooser.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {choices.map((choice) => (
            <li key={choice.projectId}>
              <Link href={choice.href} className={textNavLinkClassName}>
                <span className="font-medium">{choice.name}</span>
                <span className="ms-2 text-xs text-[var(--pf-text-muted)]">
                  {choice.kind === 'site_log'
                    ? t('fieldLogChooser.siteLogBadge')
                    : t('fieldLogChooser.fieldLogBadge')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    
      </MainAppSection>
    </MainAppPage>
  );
}

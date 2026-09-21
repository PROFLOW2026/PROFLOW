import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ProjectCreateForm } from '@/modules/projects/ui/project-create-form';
import { resolveLabelLocale } from '@/shared/i18n/intl-locale';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import {
  employeeCreateProjectAction,
  loadEmployeeProjectCreatePagePayload,
} from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'employeeApp.projects' });
  return { title: t('createTitle') };
}

export default async function EmployeeCreateProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('employeeApp.projects');
  const payload = await loadEmployeeProjectCreatePagePayload();
  if (!payload) notFound();

  const labelLocale = resolveLabelLocale(locale);
  const sample = formatMoney(zeroMoney(payload.baseCurrency), labelLocale, {
    currencyDisplay: 'narrowSymbol',
  });
  const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('createDescription')}</p>
      <ProjectCreateForm
        formAction={employeeCreateProjectAction}
        baseCurrency={payload.baseCurrency}
        currencySymbol={currencySymbol}
        clients={payload.clients}
        taxRatePercent={payload.taxRatePercent}
        uwmTemplates={payload.uwmTemplates}
        cloneSourceProjects={payload.cloneSourceProjects}
        teamCandidates={payload.teamCandidates}
        submitLabel={t('createSubmit')}
        capabilities={{
          canSelectClient: payload.capabilities.canSelectClient,
          canCreateClient: payload.capabilities.canCreateClient,
          showFinance: payload.capabilities.showFinance,
          showBillingPlan: payload.capabilities.showBillingPlan,
          showTemplatePicker: payload.capabilities.showTemplatePicker,
          showTeamSection: payload.capabilities.showTeamSection,
        }}
      />
    </div>
  );
}

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { ProjectCreateForm } from './project-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'projects' });
  return { title: t('create.title') };
}

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('projects');
  const shell = await getShellContext();
  const baseCurrency = shell?.organization.baseCurrency ?? 'ILS';

  let clients: { id: string; name: string }[] = [];
  let taxRatePercent: string | null = null;
  try {
    const loaded = await withOrgContext(async (context) => {
      const rows = await listClientsForOrg(context, {});
      const tax = await resolveApplicableDefaultTax(
        context,
        todayInTimeZone(context.organization.timezone),
      );
      return {
        clients: rows.map((client) => ({ id: client.id, name: client.name })),
        taxRatePercent: tax.resolved?.ratePercent ?? null,
      };
    });
    clients = loaded.clients;
    taxRatePercent = loaded.taxRatePercent;
  } catch {
    clients = [];
  }

  const sample = formatMoney(zeroMoney(baseCurrency), locale, { currencyDisplay: 'narrowSymbol' });
  const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('create.title')} description={t('create.description')} />
      <ProjectCreateForm
        baseCurrency={baseCurrency}
        currencySymbol={currencySymbol}
        clients={clients}
        taxRatePercent={taxRatePercent}
      />
    </div>
  );
}

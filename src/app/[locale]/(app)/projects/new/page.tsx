import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listAvailableCreateWorkKinds } from '@/components/shell/quick-create-actions';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg, listContactsForClients } from '@/modules/clients';
import {
  getBusinessProfileKeyForOrg,
  getBusinessProfileSetup,
} from '@/modules/tenancy';
import {
  getProjectTemplate,
  type ProjectTemplateKey,
  PROJECT_TEMPLATE_KEYS,
} from '@/modules/projects/domain/templates';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { ProjectCreateForm } from './project-create-form';
import { WorkKindCreateHint } from './work-kind-create-hint';

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
  const nameLocale = locale === 'en' ? 'en' : 'he-IL';

  let clients: {
    id: string;
    name: string;
    contacts: {
      id: string;
      name: string;
      phone: string | null;
      role: string;
      createdAt?: string;
    }[];
  }[] = [];
  let taxRatePercent: string | null = null;
  let recommendedTemplateNames: string[] = [];
  try {
    const loaded = await withOrgContext(async (context) => {
      const rows = await listClientsForOrg(context, {});
      const contacts = await listContactsForClients(
        context,
        rows.map((client) => client.id),
      );
      const contactsByClient = new Map<string, typeof contacts>();
      for (const contact of contacts) {
        const list = contactsByClient.get(contact.clientId) ?? [];
        list.push(contact);
        contactsByClient.set(contact.clientId, list);
      }
      const tax = await resolveApplicableDefaultTax(
        context,
        todayInTimeZone(context.organization.timezone),
      );
      const profileKey = await getBusinessProfileKeyForOrg(
        context.db,
        context.organizationId,
      );
      const allowed = new Set<string>(PROJECT_TEMPLATE_KEYS);
      const templateNames =
        profileKey == null
          ? []
          : getBusinessProfileSetup(profileKey)
              .projectTemplateKeys.filter((key): key is ProjectTemplateKey => allowed.has(key))
              .map((key) => {
                const catalog = getProjectTemplate(key);
                if (!catalog) return null;
                return nameLocale === 'he-IL' ? catalog.nameHe : catalog.nameEn;
              })
              .filter((name): name is string => Boolean(name));

      return {
        clients: rows.map((client) => ({
          id: client.id,
          name: client.name,
          contacts: (contactsByClient.get(client.id) ?? []).map((contact) => ({
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            role: contact.role,
            createdAt: contact.createdAt.toISOString(),
          })),
        })),
        taxRatePercent: tax.resolved?.ratePercent ?? null,
        recommendedTemplateNames: templateNames,
      };
    });
    clients = loaded.clients;
    taxRatePercent = loaded.taxRatePercent;
    recommendedTemplateNames = loaded.recommendedTemplateNames;
  } catch {
    clients = [];
  }

  const sample = formatMoney(zeroMoney(baseCurrency), locale, { currencyDisplay: 'narrowSymbol' });
  const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';
  const workKindOptions = shell
    ? listAvailableCreateWorkKinds(
        shell.permissions,
        shell.modules,
        shell.workMix ?? 'projects',
        shell.suggestedDefaults,
      )
    : [];

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('create.title')} description={t('create.description')} />
      {recommendedTemplateNames.length > 0 ? (
        <Alert tone="info" role="status">
          <p className="text-sm">
            {t('create.recommendedTemplatesTip', {
              templates: recommendedTemplateNames.join(' · '),
            })}
          </p>
        </Alert>
      ) : null}
      <WorkKindCreateHint
        current="project"
        defaultWorkKind={shell?.suggestedDefaults?.defaultWorkKind}
        options={workKindOptions}
        messagesNamespace="projects"
      />
      <ProjectCreateForm
        baseCurrency={baseCurrency}
        currencySymbol={currencySymbol}
        clients={clients}
        taxRatePercent={taxRatePercent}
      />
    </div>
  );
}

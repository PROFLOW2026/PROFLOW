import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getProspectById } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProspectContactForm } from './prospect-contact-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; prospectId: string }>;
}): Promise<Metadata> {
  const { locale, prospectId } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  try {
    const prospect = await withOrgContext((context) => getProspectById(context, prospectId));
    return { title: prospect.name };
  } catch {
    return { title: t('nav.prospects') };
  }
}

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ prospectId: string }>;
}) {
  const { prospectId } = await params;
  const t = await getTranslations('crm');

  let prospect;
  let canManage = false;
  try {
    const result = await withOrgContext(async (context) => ({
      prospect: await getProspectById(context, prospectId),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
    }));
    prospect = result.prospect;
    canManage = result.canManage;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={prospect.name}
        meta={
          <StatusBadge
            shape={prospect.status === 'active' ? 'active' : 'archived'}
            label={t(`statuses.prospect.${prospect.status}`)}
          />
        }
        breadcrumb={
          <Link
            href="/crm/prospects"
            className="text-sm text-[var(--pf-text-secondary)] hover:underline"
          >
            {t('nav.prospects')}
          </Link>
        }
      />

      {(prospect.companyName || prospect.email || prospect.phone || prospect.notes) && (
        <Card>
          <CardContent className="flex flex-col gap-1 pt-6 text-sm">
            {prospect.companyName ? <p>{prospect.companyName}</p> : null}
            {prospect.email ? <p>{prospect.email}</p> : null}
            {prospect.phone ? <p>{prospect.phone}</p> : null}
            {prospect.notes ? (
              <p className="text-[var(--pf-text-secondary)]">{prospect.notes}</p>
            ) : null}
            {prospect.convertedClientId ? (
              <Link
                href={`/clients/${prospect.convertedClientId}`}
                className="mt-2 hover:underline"
              >
                {t('opportunity.openClient')}
              </Link>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('prospect.contacts')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {prospect.contacts.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {prospect.contacts.map((contact) => (
                <li
                  key={contact.id}
                  className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
                >
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-[var(--pf-text-secondary)]">
                    {[contact.role, contact.email, contact.phone].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canManage ? <ProspectContactForm prospectId={prospect.id} /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

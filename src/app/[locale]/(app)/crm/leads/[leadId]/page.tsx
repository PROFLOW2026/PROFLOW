import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getLeadById } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { LeadStatusForm } from './lead-status-form';
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; leadId: string }>;
}): Promise<Metadata> {
  const { locale, leadId } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  try {
    const lead = await withOrgContext((context) => getLeadById(context, leadId));
    return { title: lead.title };
  } catch {
    return { title: t('nav.leads') };
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const t = await getTranslations('crm');

  let lead;
  let canManage = false;
  try {
    const result = await withOrgContext(async (context) => ({
      lead: await getLeadById(context, leadId),
      canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
    }));
    lead = result.lead;
    canManage = result.canManage;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={lead.title}
        meta={
          <StatusBadge
            shape={lead.status === 'new' || lead.status === 'qualified' ? 'active' : 'archived'}
            label={t(`statuses.lead.${lead.status}`)}
          />
        }
        breadcrumb={
          <Link href="/crm/leads" className={textNavLinkMutedClassName}>
            {t('nav.leads')}
          </Link>
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-1 pt-6 text-sm">
          {lead.source ? <p className="text-start">{lead.source}</p> : null}
          {lead.email ? (
            <p className="text-start" dir="ltr">
              {lead.email}
            </p>
          ) : null}
          {lead.phone ? (
            <p className="text-start" dir="ltr">
              {lead.phone}
            </p>
          ) : null}
          {lead.notes ? <p className="text-start text-[var(--pf-text-secondary)]">{lead.notes}</p> : null}
          {canManage ? (
            <Link
              href={`/crm/opportunities/new?leadId=${lead.id}`}
              className={cn(textNavLinkClassName, 'mt-3 self-start text-sm')}
            >
              {t('lead.createOpportunity')}
            </Link>
          ) : null}
        </CardContent>
      </Card>
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('lead.statusSection')}</CardTitle>
          </CardHeader>
          <CardContent>
            <LeadStatusForm lead={lead} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

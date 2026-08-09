import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getLeadById } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';

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
  try {
    lead = await withOrgContext((context) => getLeadById(context, leadId));
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
          <Link href="/crm/leads" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('nav.leads')}
          </Link>
        }
      />
      <Card>
        <CardContent className="flex flex-col gap-1 pt-6 text-sm">
          {lead.source ? <p>{lead.source}</p> : null}
          {lead.email ? <p>{lead.email}</p> : null}
          {lead.phone ? <p>{lead.phone}</p> : null}
          {lead.notes ? <p className="text-[var(--pf-text-secondary)]">{lead.notes}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

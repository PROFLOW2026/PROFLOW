import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listProjectsForOrg } from '@/modules/projects';
import {
  getVendorById,
  listVendorEngagementHistory,
} from '@/modules/vendors';
import { VendorEngagementsPanel } from '@/modules/vendors/ui';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { upsertEntityFieldValueAction } from '../../settings/custom-fields/actions';
import { VendorContactForm } from './vendor-contact-form';
import { VendorEditForm } from './vendor-edit-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; vendorId: string }>;
}): Promise<Metadata> {
  const { locale, vendorId } = await params;
  const t = await getTranslations({ locale, namespace: 'vendors' });

  try {
    const vendor = await withOrgContext((context) => getVendorById(context, vendorId));
    return { title: vendor.name };
  } catch {
    return { title: t('detail.title') };
  }
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  const t = await getTranslations('vendors');
  const tStatus = await getTranslations('status.generic');
  const tTypes = await getTranslations('vendors.types');

  let vendor;
  let documentsPanel;
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let engagementHistory: Awaited<ReturnType<typeof listVendorEngagementHistory>> = [];
  let candidateProjects: { id: string; name: string }[] = [];
  let canManage = false;
  let defaultStartDate = '';

  try {
    const result = await withOrgContext(async (context) => {
      const detail = await getVendorById(context, vendorId);
      const allowManage = hasPermission(context, PERMISSIONS.VENDORS_MANAGE);
      const [panel, fields, history, projects] = await Promise.all([
        getEntityDocumentPanelData(context, 'vendor', vendorId),
        listCustomFieldValuesForEntity(context, 'vendor', vendorId).catch(() => []),
        listVendorEngagementHistory(context, vendorId).catch(() => []),
        allowManage
          ? listProjectsForOrg(context, {}).catch(() => [])
          : Promise.resolve([]),
      ]);
      return {
        vendor: detail,
        documentsPanel: panel,
        customFields: fields,
        engagementHistory: history,
        candidateProjects: projects.map((project) => ({
          id: project.id,
          name: project.name,
        })),
        canManage: allowManage,
        defaultStartDate: todayInTimeZone(context.organization.timezone),
      };
    });
    vendor = result.vendor;
    documentsPanel = result.documentsPanel;
    customFields = result.customFields;
    engagementHistory = result.engagementHistory;
    candidateProjects = result.candidateProjects;
    canManage = result.canManage;
    defaultStartDate = result.defaultStartDate;
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={vendor.name}
        description={t('detail.profileHint')}
        meta={
          <>
            <StatusBadge
              shape={vendor.archivedAt || vendor.status === 'inactive' ? 'archived' : 'active'}
              label={vendor.archivedAt ? t('detail.archivedBadge') : tStatus(vendor.status)}
            />
            <span className="text-sm text-[var(--pf-text-secondary)]">{tTypes(vendor.type)}</span>
          </>
        }
        breadcrumb={
          <Link href="/vendors" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />

      {canManage ? <VendorEditForm vendor={vendor} /> : null}

      {!canManage && (vendor.email || vendor.phone || vendor.addressLine1 || vendor.notes) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.profileSection')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {vendor.email ? (
              <p className="text-start" dir="ltr">
                {vendor.email}
              </p>
            ) : null}
            {vendor.phone ? (
              <p className="text-start" dir="ltr">
                {vendor.phone}
              </p>
            ) : null}
            {vendor.addressLine1 ? (
              <p className="text-start">
                {vendor.addressLine1}
                {vendor.city ? `, ${vendor.city}` : ''}
              </p>
            ) : null}
            {vendor.parentVendorName ? (
              <p className="text-start text-[var(--pf-text-secondary)]">
                {t('detail.parentVendor', { name: vendor.parentVendorName })}
              </p>
            ) : null}
            {vendor.notes ? (
              <p className="text-start text-[var(--pf-text-secondary)]">{vendor.notes}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <EntityCustomFieldsPanel
        entityId={vendor.id}
        fields={customFields}
        revalidatePath={`/vendors/${vendor.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.contactsSection')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {vendor.contacts.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.contactsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vendor.contacts.map((contact) => (
                <li key={contact.id} className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm">
                  <p className="text-start font-medium">{contact.name}</p>
                  <p className="text-start text-[var(--pf-text-secondary)]">
                    {t(`detail.contactRoles.${contact.role}`)}
                    {contact.email ? (
                      <>
                        {' · '}
                        <span dir="ltr">{contact.email}</span>
                      </>
                    ) : null}
                    {contact.phone ? (
                      <>
                        {' · '}
                        <span dir="ltr">{contact.phone}</span>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {canManage ? <VendorContactForm vendorId={vendor.id} /> : null}
        </CardContent>
      </Card>

      <VendorEngagementsPanel
        vendorId={vendor.id}
        engagements={vendor.engagements}
        history={engagementHistory}
        candidateProjects={candidateProjects}
        canManage={canManage}
        defaultStartDate={defaultStartDate}
      />

      <DocumentAttachments
        ownerType="vendor"
        ownerId={vendor.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}

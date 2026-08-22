import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { listCustomFieldValuesForEntity } from '@/modules/custom-fields';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { listProjectsForOrg } from '@/modules/projects';
import {
  getVendorApOutstanding,
  getVendorPayablesAging,
  listVendorCredits,
  listVendorPaymentsForVendor,
} from '@/modules/ap';
import { VendorAp360Panel } from '@/modules/ap/ui/vendor-ap-360-panel';
import { listBusinessCatalog, localizePaymentTermName, localizePaymentTermOptions } from '@/modules/business-catalog';
import {
  getVendorById,
  listVendorEngagementHistory,
  listVendorSubcontracts,
  getSubcontractById,
  listSubcontractParentContracts,
  listSubcontractDocumentCandidates,
} from '@/modules/vendors';
import { getVendorPerformance } from '@/modules/vendors/application/get-vendor-performance';
import {
  Vendor360Shell,
  VendorEngagementsPanel,
  VendorSubcontractsPanel,
  VendorPerformancePanel,
} from '@/modules/vendors/ui';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { upsertEntityFieldValueAction } from '../../settings/custom-fields/actions';
import { VendorContactForm } from './vendor-contact-form';
import { VendorEditForm } from './vendor-edit-form';
import { VendorIdentifiersPanel } from './vendor-identifiers-panel';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { RelatedCommunicationsPanel } from '@/modules/communications/ui/related-panel';
import { PrepareMessageLink } from '@/modules/communications/ui/prepare-message-link';

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
  params: Promise<{ locale: string; vendorId: string }>;
}) {
  const { locale, vendorId } = await params;
  const t = await getTranslations('vendors');
  const tStatus = await getTranslations('status.generic');
  const tTypes = await getTranslations('vendors.types');

  let vendor;
  let documentsPanel;
  let customFields: Awaited<ReturnType<typeof listCustomFieldValuesForEntity>> = [];
  let engagementHistory: Awaited<ReturnType<typeof listVendorEngagementHistory>> = [];
  let subcontracts: Awaited<ReturnType<typeof listVendorSubcontracts>> = [];
  let subcontractDetails: Awaited<ReturnType<typeof getSubcontractById>>[] = [];
  let parentContracts: Awaited<ReturnType<typeof listSubcontractParentContracts>> = [];
  let documentCandidates: Awaited<ReturnType<typeof listSubcontractDocumentCandidates>> = [];
  let candidateProjects: { id: string; name: string }[] = [];
  let canManage = false;
  let canReadAp = false;
  let defaultStartDate = '';
  let apOutstanding: Awaited<ReturnType<typeof getVendorApOutstanding>> | null = null;
  let apAging: Awaited<ReturnType<typeof getVendorPayablesAging>> | null = null;
  let apCredits: Awaited<ReturnType<typeof listVendorCredits>> = [];
  let apPayments: Awaited<ReturnType<typeof listVendorPaymentsForVendor>> = [];
  let performance: Awaited<ReturnType<typeof getVendorPerformance>> | null = null;
  let paymentTerms: Awaited<ReturnType<typeof listBusinessCatalog>> = [];
  let categories: Awaited<ReturnType<typeof listBusinessCatalog>> = [];
  let specialties: Awaited<ReturnType<typeof listBusinessCatalog>> = [];

  try {
    const result = await withOrgContext(async (context) => {
      const detail = await getVendorById(context, vendorId);
      const allowManage = hasPermission(context, PERMISSIONS.VENDORS_MANAGE);
      const allowAp = hasPermission(context, PERMISSIONS.AP_READ);
      const [
        panel,
        fields,
        history,
        projects,
        agreements,
        contracts,
        docs,
        performanceRow,
        paymentTermRows,
        categoryRows,
        specialtyRows,
      ] = await Promise.all([
        getEntityDocumentPanelData(context, 'vendor', vendorId),
        listCustomFieldValuesForEntity(context, 'vendor', vendorId).catch(() => []),
        listVendorEngagementHistory(context, vendorId).catch(() => []),
        allowManage
          ? listProjectsForOrg(context, {}).catch(() => [])
          : Promise.resolve([]),
        listVendorSubcontracts(context, vendorId).catch(() => []),
        listSubcontractParentContracts(context).catch(() => []),
        listSubcontractDocumentCandidates(context).catch(() => []),
        getVendorPerformance(context, vendorId).catch(() => null),
        listBusinessCatalog(context, 'payment_term').catch(() => []),
        listBusinessCatalog(context, 'vendor_category').catch(() => []),
        listBusinessCatalog(context, 'vendor_specialty').catch(() => []),
      ]);
      const details = await Promise.all(
        agreements.map((agreement) => getSubcontractById(context, agreement.id).catch(() => null)),
      );
      const [outstanding, aging, credits, payments] = allowAp
        ? await Promise.all([
            getVendorApOutstanding(context, vendorId).catch(() => null),
            getVendorPayablesAging(context, vendorId).catch(() => null),
            listVendorCredits(context, { vendorId }).catch(() => []),
            listVendorPaymentsForVendor(context, vendorId).catch(() => []),
          ])
        : [null, null, [], []];
      return {
        vendor: detail,
        documentsPanel: panel,
        customFields: fields,
        engagementHistory: history,
        candidateProjects: projects.map((project) => ({
          id: project.id,
          name: project.name,
        })),
        subcontracts: agreements,
        subcontractDetails: details.filter((row): row is NonNullable<typeof row> => row !== null),
        parentContracts: contracts,
        documentCandidates: docs,
        canManage: allowManage,
        canReadAp: allowAp,
        defaultStartDate: todayInTimeZone(context.organization.timezone),
        apOutstanding: outstanding,
        apAging: aging,
        apCredits: credits,
        apPayments: payments,
        performance: performanceRow,
        paymentTerms: paymentTermRows,
        categories: categoryRows,
        specialties: specialtyRows,
      };
    });
    vendor = result.vendor;
    documentsPanel = result.documentsPanel;
    customFields = result.customFields;
    engagementHistory = result.engagementHistory;
    candidateProjects = result.candidateProjects;
    subcontracts = result.subcontracts;
    subcontractDetails = result.subcontractDetails;
    parentContracts = result.parentContracts;
    documentCandidates = result.documentCandidates;
    canManage = result.canManage;
    canReadAp = result.canReadAp;
    defaultStartDate = result.defaultStartDate;
    apOutstanding = result.apOutstanding;
    apAging = result.apAging;
    apCredits = result.apCredits;
    apPayments = result.apPayments;
    performance = result.performance;
    paymentTerms = result.paymentTerms;
    categories = result.categories;
    specialties = result.specialties;
  } catch {
    notFound();
  }

  const categoryLinks = vendor.catalogLinks.filter((link) => link.linkKind === 'vendor_category');
  const specialtyLinks = vendor.catalogLinks.filter((link) => link.linkKind === 'vendor_specialty');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={vendor.name}
        description={t('detail.profileHint')}
        meta={
          <>
            <StatusBadge
              shape={vendor.archivedAt || vendor.status === 'inactive' ? 'archived' : 'active'}
              label={
                vendor.archivedAt
                  ? t('detail.archivedBadge')
                  : vendor.status === 'inactive'
                    ? t('detail.inactiveBadge')
                    : tStatus(vendor.status)
              }
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

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.statusLifecycleHint')}</p>

      <PrepareMessageLink
        entityType="vendor"
        vendorId={vendor.id}
        recipientEmail={vendor.email}
        subject={vendor.name}
      />

      <Vendor360Shell
        identity={
          <>
            {canManage ? (
              <VendorEditForm
                vendor={vendor}
                paymentTerms={localizePaymentTermOptions(paymentTerms, locale)}
                categories={categories.map((row) => ({ id: row.id, name: row.name }))}
                specialties={specialties.map((row) => ({ id: row.id, name: row.name }))}
              />
            ) : (
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
                  {vendor.defaultPaymentTermName ? (
                    <p className="text-start text-[var(--pf-text-secondary)]">
                      {t('detail.paymentTerm', {
                        name: localizePaymentTermName(
                          vendor.defaultPaymentTermKey,
                          vendor.defaultPaymentTermName,
                          locale,
                        ),
                      })}
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
            )}
            <VendorIdentifiersPanel
              vendorId={vendor.id}
              identifiers={vendor.identifiers}
              canManage={canManage}
            />
            <EntityCustomFieldsPanel
              entityId={vendor.id}
              fields={customFields}
              revalidatePath={`/vendors/${vendor.id}`}
              saveAction={upsertEntityFieldValueAction}
            />
          </>
        }
        contacts={
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
                    <li
                      key={contact.id}
                      className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm"
                    >
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
        }
        categories={
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('detail.categoriesSection')}</CardTitle>
              <CardDescription>{t('detail.categoriesHint')}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <p className="font-medium">{t('catalog.categoriesLabel')}</p>
                {categoryLinks.length === 0 ? (
                  <p className="text-[var(--pf-text-secondary)]">{t('detail.categoriesEmpty')}</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc">
                    {categoryLinks.map((link) => (
                      <li key={link.id}>{link.entryName}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="font-medium">{t('catalog.specialtiesLabel')}</p>
                {specialtyLinks.length === 0 ? (
                  <p className="text-[var(--pf-text-secondary)]">{t('detail.specialtiesEmpty')}</p>
                ) : (
                  <ul className="mt-1 list-inside list-disc">
                    {specialtyLinks.map((link) => (
                      <li key={link.id}>{link.entryName}</li>
                    ))}
                  </ul>
                )}
              </div>
              {canManage ? (
                <p className="text-xs text-[var(--pf-text-secondary)]">{t('detail.categoriesEditHint')}</p>
              ) : null}
            </CardContent>
          </Card>
        }
        commercial={
          <>
            <VendorAp360Panel
              canRead={canReadAp}
              outstanding={apOutstanding}
              aging={apAging}
              credits={apCredits}
              payments={apPayments}
              linkedProjects={[
                ...vendor.engagements.map((engagement) => ({
                  id: engagement.projectId,
                  name: engagement.projectName,
                })),
                ...engagementHistory.map((engagement) => ({
                  id: engagement.projectId,
                  name: engagement.projectName,
                })),
              ].filter(
                (project, index, all) => all.findIndex((row) => row.id === project.id) === index,
              )}
            />
            <VendorSubcontractsPanel
              vendorId={vendor.id}
              vendorType={vendor.type}
              items={subcontracts}
              details={subcontractDetails}
              candidateProjects={candidateProjects}
              parentContracts={parentContracts}
              documentCandidates={documentCandidates}
              canManage={canManage}
              defaultStartDate={defaultStartDate}
            />
          </>
        }
        projects={
          <VendorEngagementsPanel
            vendorId={vendor.id}
            engagements={vendor.engagements}
            history={engagementHistory}
            candidateProjects={candidateProjects}
            canManage={canManage}
            defaultStartDate={defaultStartDate}
          />
        }
        performance={<VendorPerformancePanel performance={performance} />}
        documents={
          <DocumentAttachments
            ownerType="vendor"
            ownerId={vendor.id}
            documents={documentsPanel.documents}
            linkCandidates={documentsPanel.linkCandidates}
            canRead={documentsPanel.canRead}
            canManage={documentsPanel.canManage}
            storageConfigured={documentsPanel.storageConfigured}
          />
        }
        activity={<RelatedCommunicationsPanel vendorId={vendor.id} />}
      />
    </div>
  );
}

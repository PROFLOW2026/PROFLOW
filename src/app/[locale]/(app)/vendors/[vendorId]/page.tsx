import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { isStorageConfigured, listEntityDocuments } from '@/modules/documents';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getVendorById } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { VendorContactForm } from './vendor-contact-form';

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
  let documents;
  let canManageDocuments = false;
  let canReadDocuments = false;

  try {
    const result = await withOrgContext(async (context) => {
      const detail = await getVendorById(context, vendorId);
      const attachments = await listEntityDocuments(context, {
        ownerType: 'vendor',
        ownerId: vendorId,
      });
      return {
        vendor: detail,
        documents: attachments,
        canManageDocuments: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
        canReadDocuments: hasPermission(context, PERMISSIONS.DOCUMENTS_READ),
      };
    });
    vendor = result.vendor;
    documents = result.documents;
    canManageDocuments = result.canManageDocuments;
    canReadDocuments = result.canReadDocuments;
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
              shape={vendor.status === 'active' ? 'active' : 'archived'}
              label={tStatus(vendor.status)}
            />
            <span className="text-sm text-[var(--pf-text-secondary)]">{tTypes(vendor.type)}</span>
          </>
        }
        breadcrumb={
          <Link href="/vendors" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
      />

      {(vendor.email || vendor.phone || vendor.addressLine1 || vendor.notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('detail.profileSection')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {vendor.email ? <p>{vendor.email}</p> : null}
            {vendor.phone ? <p>{vendor.phone}</p> : null}
            {vendor.addressLine1 ? <p>{vendor.addressLine1}{vendor.city ? `, ${vendor.city}` : ''}</p> : null}
            {vendor.parentVendorName ? (
              <p className="text-[var(--pf-text-secondary)]">
                {t('detail.parentVendor', { name: vendor.parentVendorName })}
              </p>
            ) : null}
            {vendor.notes ? <p className="text-[var(--pf-text-secondary)]">{vendor.notes}</p> : null}
          </CardContent>
        </Card>
      )}

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
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-[var(--pf-text-secondary)]">
                    {t(`detail.contactRoles.${contact.role}`)}
                    {contact.email ? ` · ${contact.email}` : ''}
                    {contact.phone ? ` · ${contact.phone}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <VendorContactForm vendorId={vendor.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.engagementsSection')}</CardTitle>
        </CardHeader>
        <CardContent>
          {vendor.engagements.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.engagementsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {vendor.engagements.map((engagement) => (
                <li key={engagement.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{engagement.projectName}</span>
                  {engagement.role ? (
                    <span className="text-[var(--pf-text-secondary)]">{engagement.role}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DocumentAttachments
        ownerType="vendor"
        ownerId={vendor.id}
        documents={documents}
        canRead={canReadDocuments}
        canManage={canManageDocuments}
        storageConfigured={isStorageConfigured()}
      />
    </div>
  );
}

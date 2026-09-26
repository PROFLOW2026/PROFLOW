import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { StatusBadge } from '@/components/ui/status-badge';
import { getVendorById } from '@/modules/vendors';
import { withOrgContext } from '@/shared/auth/session';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export default async function EmployeeVendorDetailPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}) {
  const { vendorId } = await params;
  const t = await getTranslations('employeeApp.vendors');
  const tVendors = await getTranslations('vendors');

  const vendor = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!employeeHasPermission(context, PERMISSIONS.VENDORS_READ)) return null;
    try {
      return await getVendorById(context, vendorId);
    } catch {
      return null;
    }
  });

  if (!vendor) notFound();

  const inactive = Boolean(vendor.archivedAt) || vendor.status === 'inactive';

  return (
    <div className="space-y-4">
      <Link
        href="/employee/vendors"
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{vendor.name}</h1>
        <StatusBadge
          shape={inactive ? 'archived' : 'active'}
          label={inactive ? tVendors('detail.inactiveBadge') : tVendors(`list.status.${vendor.status}`)}
        />
        <span className="text-sm text-[var(--pf-text-secondary)]">{tVendors(`types.${vendor.type}`)}</span>
      </div>
      <section className="space-y-1 text-sm">
        {vendor.email ? <p dir="ltr">{vendor.email}</p> : null}
        {vendor.phone ? <p dir="ltr">{vendor.phone}</p> : null}
        {vendor.addressLine1 ? (
          <p>
            {vendor.addressLine1}
            {vendor.city ? `, ${vendor.city}` : ''}
          </p>
        ) : null}
        {vendor.parentVendorName ? (
          <p className="text-[var(--pf-text-secondary)]">
            {tVendors('detail.parentVendor', { name: vendor.parentVendorName })}
          </p>
        ) : null}
        {vendor.notes ? <p className="text-[var(--pf-text-secondary)]">{vendor.notes}</p> : null}
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{t('detail.contacts')}</h2>
        {vendor.contacts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{tVendors('detail.contactsEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {vendor.contacts.map((contact) => (
              <li
                key={contact.id}
                className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-3 py-2 text-sm"
              >
                <p className="font-medium">{contact.name}</p>
                <p className="text-[var(--pf-text-secondary)]">
                  {tVendors(`detail.contactRoles.${contact.role}`)}
                  {contact.email ? ` · ${contact.email}` : ''}
                  {contact.phone ? ` · ${contact.phone}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {vendor.engagements.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t('detail.projects')}</h2>
          <ul className="space-y-1 text-sm">
            {vendor.engagements.map((engagement) => (
              <li key={engagement.id}>{engagement.projectName}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { authorize } from '@/shared/permissions/authorize';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { listDocumentsForEntity } from '@/modules/documents';
import { resolveLinkedEmployee } from '@/modules/workforce/application/time-scope';
import { canReadDocumentCategoryForContext } from '@/modules/documents/application/document-visibility';

export default async function EmployeeDocumentsPage() {
  const t = await getTranslations('employeeApp');
  const docs = await withOrgContext(async (context) => {
    await authorize(context, { permission: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' });
    const employee = await resolveLinkedEmployee(context);
    if (!employee) return [];
    const items = await listDocumentsForEntity(context.db, context.organizationId, {
      ownerType: 'employee',
      ownerId: employee.id,
    });
    return items.filter((doc) => canReadDocumentCategoryForContext(context, doc.category));
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('nav.documents')}</h1>
      <ul className="divide-y divide-[var(--pf-border)] rounded-lg border border-[var(--pf-border)]">
        {docs.map((doc) => (
          <li key={doc.id} className="px-4 py-3 text-sm">
            <div className="font-medium">{doc.originalFilename}</div>
            <div className="text-[var(--pf-text-secondary)]">{doc.category ?? '—'}</div>
          </li>
        ))}
        {docs.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">—</li>
        ) : null}
      </ul>
    </div>
  );
}

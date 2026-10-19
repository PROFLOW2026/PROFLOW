import { getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAccessibleDocuments } from '@/modules/employee-app/application/employee-accessible-documents';
import { EmployeeDocumentsBrowser } from '@/modules/employee-app/ui/employee-documents-browser';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeDocumentsPage() {
  const locale = await getLocale();
  const docs = await withOrgContext((context) => listEmployeeAccessibleDocuments(context));
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className={employeePageStackClass}>
      <EmployeeDocumentsBrowser
        items={docs.map((doc) => ({
          id: doc.id,
          filename: doc.originalFilename,
          mimeType: doc.mimeType,
          category: doc.category,
          createdLabel: dateFmt.format(doc.createdAt),
          status: doc.status,
        }))}
      />
    </div>
  );
}

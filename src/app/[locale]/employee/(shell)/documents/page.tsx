import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAccessibleDocuments } from '@/modules/employee-app/application/employee-accessible-documents';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeDocumentsPage() {
  const t = await getTranslations('employeeApp.lists');
  const docs = await withOrgContext((context) => listEmployeeAccessibleDocuments(context));

  return (
    <div className={employeePageStackClass}>
      <ul className={employeeListPanelClass}>
        {docs.map((doc) => (
          <li key={doc.id} className={employeeListRowClass}>
            <div className="font-medium">{doc.originalFilename}</div>
            <div className="text-[var(--pf-text-secondary)]">{doc.category ?? t('noCategory')}</div>
          </li>
        ))}
        {docs.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-[var(--pf-text-secondary)]">
            {t('documentsEmpty')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

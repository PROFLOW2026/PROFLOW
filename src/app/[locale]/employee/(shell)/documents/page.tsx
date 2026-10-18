import { FileText } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { listEmployeeAccessibleDocuments } from '@/modules/employee-app/application/employee-accessible-documents';
import { EmployeeEmptyState } from '@/modules/employee-app/ui/employee-empty-state';
import { EmployeeFileTypeIcon } from '@/modules/employee-app/ui/employee-file-type-icon';
import {
  employeeListPanelClass,
  employeeListRowClass,
  employeeMetaChipClass,
  employeePageStackClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

export default async function EmployeeDocumentsPage() {
  const t = await getTranslations('employeeApp.lists');
  const locale = await getLocale();
  const docs = await withOrgContext((context) => listEmployeeAccessibleDocuments(context));
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className={employeePageStackClass}>
      {docs.length > 0 ? (
        <ul className={employeeListPanelClass}>
          {docs.map((doc) => (
            <li key={doc.id} className={employeeListRowClass}>
              <EmployeeFileTypeIcon mimeType={doc.mimeType} filename={doc.originalFilename} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-semibold text-[var(--pf-text-primary)]">
                  {doc.originalFilename}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--pf-text-secondary)]">
                  <span className={employeeMetaChipClass}>
                    {doc.category ?? t('noCategory')}
                  </span>
                  <time dateTime={doc.createdAt.toISOString()}>
                    {t('documentDate', { date: dateFmt.format(doc.createdAt) })}
                  </time>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmployeeEmptyState title={t('documentsEmpty')} icon={FileText} />
      )}
    </div>
  );
}

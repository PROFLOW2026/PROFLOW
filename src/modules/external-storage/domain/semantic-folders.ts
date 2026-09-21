import type { SemanticFolderType } from './types';

/** Display names for managed folders (Hebrew labels in provider; identity is semantic type). */
export const SEMANTIC_FOLDER_DISPLAY: Record<SemanticFolderType, string> = {
  organization_root: 'ProjectFlow',
  clients_root: 'לקוחות',
  client_root: '',
  project_root: '',
  quotes: '01 - הצעות מחיר',
  contracts: '02 - חוזים',
  billing: '03 - חשבונות חיוב',
  vendor_invoices: '04 - חשבוניות ספקים',
  plans: '05 - תוכניות',
  photos: '06 - תמונות',
  documents: '07 - מסמכים',
  general_files: '08 - קבצים כלליים',
  vendors_root: 'ספקים',
  employees_root: 'עובדים',
  organization_documents: 'מסמכי חברה',
};

export const PROJECT_SEMANTIC_FOLDERS: readonly SemanticFolderType[] = [
  'quotes',
  'contracts',
  'billing',
  'vendor_invoices',
  'plans',
  'photos',
  'documents',
  'general_files',
];

export const ORGANIZATION_BASE_FOLDERS: readonly SemanticFolderType[] = [
  'clients_root',
  'vendors_root',
  'employees_root',
  'organization_documents',
];

export function resolveSemanticFolderDisplayName(
  type: SemanticFolderType,
  entityName?: string | null,
): string {
  if (type === 'client_root' || type === 'project_root') {
    return (entityName ?? '').trim() || 'ProjectFlow';
  }
  return SEMANTIC_FOLDER_DISPLAY[type] ?? type;
}

/** Map document owner types to default upload folder for attachments. */
export function semanticFolderForDocumentOwner(
  ownerType: string,
  category?: string | null,
): SemanticFolderType {
  const cat = (category ?? '').trim().toLowerCase();
  if (cat === 'photo' || cat === 'drawing') return 'photos';
  if (cat === 'document' || cat === 'file') return 'general_files';
  if (cat === 'contract') return 'contracts';
  if (cat === 'quote') return 'quotes';
  if (cat === 'invoice' || cat === 'receipt') return 'vendor_invoices';

  switch (ownerType) {
    case 'expense':
    case 'ap_bill':
      return 'vendor_invoices';
    case 'billing_record':
      return 'billing';
    case 'quote_version':
      return 'quotes';
    case 'daily_log':
    case 'punch_list_item':
    case 'inspection':
    case 'task':
    case 'task_comment':
      return 'photos';
    case 'project':
    case 'contract':
      return 'documents';
    case 'client':
      return 'documents';
    case 'vendor':
      return 'organization_documents';
    case 'employee':
      return 'organization_documents';
    default:
      return 'general_files';
  }
}

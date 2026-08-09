import type { EnabledImportKind, ImportFieldDef, ImportKind } from './types';

const CLIENT_FIELDS: readonly ImportFieldDef[] = [
  { key: 'name', required: true, aliases: ['name', 'client_name', 'client', 'שם', 'שם_לקוח'] },
  { key: 'legalName', required: false, aliases: ['legal_name', 'legalname', 'שם_משפטי'] },
  { key: 'email', required: false, aliases: ['email', 'e_mail', 'אימייל', 'דואל'] },
  { key: 'phone', required: false, aliases: ['phone', 'tel', 'telephone', 'טלפון'] },
  { key: 'city', required: false, aliases: ['city', 'עיר'] },
  { key: 'countryCode', required: false, aliases: ['country_code', 'country', 'מדינה'] },
  { key: 'notes', required: false, aliases: ['notes', 'הערות'] },
];

const VENDOR_FIELDS: readonly ImportFieldDef[] = [
  { key: 'name', required: true, aliases: ['name', 'vendor_name', 'vendor', 'supplier', 'שם', 'שם_ספק'] },
  {
    key: 'type',
    required: false,
    aliases: ['type', 'vendor_type', 'סוג'],
  },
  { key: 'email', required: false, aliases: ['email', 'e_mail', 'אימייל'] },
  { key: 'phone', required: false, aliases: ['phone', 'tel', 'טלפון'] },
  { key: 'city', required: false, aliases: ['city', 'עיר'] },
  { key: 'countryCode', required: false, aliases: ['country_code', 'country', 'מדינה'] },
  { key: 'notes', required: false, aliases: ['notes', 'הערות'] },
];

const EMPLOYEE_FIELDS: readonly ImportFieldDef[] = [
  { key: 'name', required: true, aliases: ['name', 'employee_name', 'employee', 'שם', 'שם_עובד'] },
  { key: 'email', required: false, aliases: ['email', 'אימייל'] },
  { key: 'phone', required: false, aliases: ['phone', 'טלפון'] },
  { key: 'jobTitle', required: false, aliases: ['job_title', 'title', 'תפקיד'] },
  { key: 'employeeNumber', required: false, aliases: ['employee_number', 'number', 'מספר_עובד'] },
  {
    key: 'rateUnit',
    required: false,
    aliases: ['rate_unit', 'unit', 'יחידת_תעריף'],
  },
  { key: 'baseRate', required: false, aliases: ['base_rate', 'rate', 'תעריף'] },
  { key: 'notes', required: false, aliases: ['notes', 'הערות'] },
];

const PROJECT_FIELDS: readonly ImportFieldDef[] = [
  { key: 'name', required: true, aliases: ['name', 'project_name', 'project', 'שם', 'שם_פרויקט'] },
  { key: 'status', required: false, aliases: ['status', 'סטטוס'] },
  { key: 'clientId', required: false, aliases: ['client_id', 'clientid'] },
  {
    key: 'clientName',
    required: false,
    aliases: ['client_name', 'client', 'customer', 'שם_לקוח', 'לקוח'],
  },
  { key: 'location', required: false, aliases: ['location', 'מיקום'] },
  { key: 'startDate', required: false, aliases: ['start_date', 'start', 'תאריך_התחלה'] },
  { key: 'targetEndDate', required: false, aliases: ['target_end_date', 'end_date', 'תאריך_יעד'] },
  { key: 'description', required: false, aliases: ['description', 'תיאור'] },
  { key: 'notes', required: false, aliases: ['notes', 'הערות'] },
];

/**
 * Safe expense import fields — maps to createExpenseSchema.
 * Tax/VAT/net columns are intentionally not mapped (VAT ≠ profit).
 */
const EXPENSE_FIELDS: readonly ImportFieldDef[] = [
  {
    key: 'expenseDate',
    required: true,
    aliases: ['expense_date', 'date', 'תאריך', 'תאריך_הוצאה'],
  },
  { key: 'description', required: true, aliases: ['description', 'תיאור'] },
  {
    key: 'amount',
    required: true,
    aliases: ['amount', 'gross_amount', 'סכום', 'סכום_ברוטו'],
  },
  { key: 'currency', required: false, aliases: ['currency', 'מטבע'] },
  { key: 'projectId', required: false, aliases: ['project_id', 'project', 'פרויקט'] },
  { key: 'vendorId', required: false, aliases: ['vendor_id', 'vendorid'] },
  {
    key: 'supplierName',
    required: false,
    aliases: ['supplier_name', 'supplier', 'vendor', 'ספק'],
  },
  {
    key: 'costFamily',
    required: false,
    aliases: ['cost_family', 'family', 'משפחת_עלות'],
  },
  { key: 'notes', required: false, aliases: ['notes', 'הערות'] },
];

const FIELDS_BY_KIND: Record<ImportKind, readonly ImportFieldDef[]> = {
  clients: CLIENT_FIELDS,
  vendors: VENDOR_FIELDS,
  employees: EMPLOYEE_FIELDS,
  projects: PROJECT_FIELDS,
  expenses: EXPENSE_FIELDS,
};

export function fieldDefsForKind(kind: ImportKind): readonly ImportFieldDef[] {
  return FIELDS_BY_KIND[kind];
}

export function requiredFieldKeys(kind: EnabledImportKind): readonly string[] {
  return fieldDefsForKind(kind)
    .filter((f) => f.required)
    .map((f) => f.key);
}

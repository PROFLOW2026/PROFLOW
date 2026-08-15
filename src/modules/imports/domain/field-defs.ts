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

const CONTACT_FIELDS: readonly ImportFieldDef[] = [
  {
    key: 'clientName',
    required: true,
    aliases: ['client_name', 'client', 'customer', 'שם_לקוח', 'לקוח'],
  },
  { key: 'clientId', required: false, aliases: ['client_id', 'clientid'] },
  { key: 'name', required: true, aliases: ['name', 'contact_name', 'contact', 'שם', 'שם_איש_קשר'] },
  { key: 'role', required: false, aliases: ['role', 'contact_role', 'תפקיד'] },
  { key: 'email', required: false, aliases: ['email', 'אימייל'] },
  { key: 'phone', required: false, aliases: ['phone', 'טלפון'] },
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
  {
    key: 'baseRate',
    required: false,
    aliases: ['base_rate', 'rate', 'תעריף'],
    requiresCostManage: true,
  },
  { key: 'notes', required: false, aliases: ['notes', 'הערות'] },
];

const PROJECT_FIELDS: readonly ImportFieldDef[] = [
  { key: 'name', required: true, aliases: ['name', 'project_name', 'project', 'job_name', 'שם', 'שם_פרויקט', 'שם_עבודה'] },
  {
    key: 'workKind',
    required: false,
    aliases: ['work_kind', 'kind', 'type', 'סוג_עבודה', 'סוג'],
  },
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

/** Managed opening via existing contract APIs — never invents Actual. */
const OPENING_VALUE_FIELDS: readonly ImportFieldDef[] = [
  { key: 'projectId', required: false, aliases: ['project_id', 'projectid'] },
  {
    key: 'projectName',
    required: false,
    aliases: ['project_name', 'project', 'job_name', 'name', 'שם_פרויקט', 'שם_עבודה', 'שם'],
  },
  {
    key: 'contractValueAmount',
    required: true,
    aliases: [
      'contract_value_amount',
      'opening_value',
      'opening_amount',
      'amount',
      'סכום',
      'ערך_פתיחה',
      'סכום_חוזה',
    ],
  },
  { key: 'currency', required: false, aliases: ['currency', 'מטבע'] },
  {
    key: 'openingReductionAmount',
    required: false,
    aliases: ['opening_reduction_amount', 'opening_reduction', 'הפחתת_פתיחה'],
  },
  {
    key: 'amountIncludesTax',
    required: false,
    aliases: ['amount_includes_tax', 'includes_tax', 'כולל_מעמ'],
  },
];

const COST_CATEGORY_FIELDS: readonly ImportFieldDef[] = [
  { key: 'key', required: false, aliases: ['key', 'category_key', 'מפתח'] },
  { key: 'name', required: true, aliases: ['name', 'category_name', 'category', 'שם', 'שם_קטגוריה'] },
  {
    key: 'family',
    required: true,
    aliases: ['family', 'cost_family', 'משפחה', 'משפחת_עלות'],
  },
];

/**
 * Project BOQ item rows — hierarchy via chapter/subchapter columns.
 * Requires projectId on confirm (wizard/context), not as a CSV column.
 */
const BOQ_ITEM_FIELDS: readonly ImportFieldDef[] = [
  {
    key: 'itemCode',
    required: false,
    aliases: ['item_code', 'itemcode', 'code', 'boq_code', 'קוד', 'קוד_פריט', 'מספר_סעיף'],
  },
  {
    key: 'description',
    required: true,
    aliases: ['description', 'desc', 'item', 'name', 'תיאור', 'תיאור_פריט', 'סעיף'],
  },
  {
    key: 'unit',
    required: false,
    aliases: ['unit', 'uom', 'measure', 'יחידה', 'יח'],
  },
  {
    key: 'quantity',
    required: false,
    aliases: ['quantity', 'qty', 'qty_', 'כמות'],
  },
  {
    key: 'unitPrice',
    required: false,
    aliases: [
      'unit_price',
      'unitprice',
      'price',
      'rate',
      'מחיר',
      'מחיר_יחידה',
      'תעריף',
    ],
  },
  {
    key: 'amount',
    required: false,
    aliases: ['amount', 'total', 'line_amount', 'סכום', 'סהכ', 'סה_כ'],
  },
  {
    key: 'chapter',
    required: false,
    aliases: ['chapter', 'section', 'header', 'פרק', 'פרק_ראשי'],
  },
  {
    key: 'subchapter',
    required: false,
    aliases: ['subchapter', 'sub_chapter', 'subsection', 'תת_פרק', 'תתפרק'],
  },
];

/**
 * Qty inventory items. Opening qty is a receive to the default location when
 * present — never Actual / Expense / FIFO.
 */
const INVENTORY_FIELDS: readonly ImportFieldDef[] = [
  { key: 'name', required: true, aliases: ['name', 'item_name', 'item', 'שם', 'שם_פריט'] },
  { key: 'sku', required: false, aliases: ['sku', 'item_code', 'code', 'מקט', 'מק״ט', 'קוד'] },
  { key: 'unit', required: false, aliases: ['unit', 'uom', 'יחידה', 'יח'] },
  { key: 'barcode', required: false, aliases: ['barcode', 'bar_code', 'qr', 'ברקוד'] },
  {
    key: 'reorderLevel',
    required: false,
    aliases: ['reorder_level', 'reorder', 'reorderlevel', 'רמת_הזמנה', 'הזמנה_מחדש'],
  },
  {
    key: 'minStockLevel',
    required: false,
    aliases: ['min_stock_level', 'min_stock', 'min', 'מלאי_מינימום', 'מינימום'],
  },
  {
    key: 'openingQty',
    required: false,
    aliases: [
      'opening_qty',
      'opening_quantity',
      'quantity_on_hand',
      'qty',
      'quantity',
      'כמות',
      'כמות_פתיחה',
    ],
  },
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
  contacts: CONTACT_FIELDS,
  vendors: VENDOR_FIELDS,
  employees: EMPLOYEE_FIELDS,
  projects: PROJECT_FIELDS,
  opening_values: OPENING_VALUE_FIELDS,
  cost_categories: COST_CATEGORY_FIELDS,
  expenses: EXPENSE_FIELDS,
  inventory: INVENTORY_FIELDS,
  boq_items: BOQ_ITEM_FIELDS,
};

export function fieldDefsForKind(kind: ImportKind): readonly ImportFieldDef[] {
  return FIELDS_BY_KIND[kind];
}

export function requiredFieldKeys(kind: EnabledImportKind): readonly string[] {
  return fieldDefsForKind(kind)
    .filter((f) => f.required)
    .map((f) => f.key);
}

import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ModuleVisibility } from '@/modules/tenancy/domain/types';
import type { SearchCommandHit } from './types';

interface CommandDef {
  readonly id: string;
  readonly href: string;
  readonly keywords: readonly string[];
  readonly titleKey: string;
  readonly allowed: (context: OrgContext, modules: ModuleVisibility) => boolean;
}

const COMMANDS: readonly CommandDef[] = [
  {
    id: 'create-expense',
    href: '/expenses/new',
    titleKey: 'commands.createExpense',
    keywords: ['create expense', 'new expense', 'הוצאה', 'צור הוצאה', 'הוסף הוצאה'],
    allowed: (context) => hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
  },
  {
    id: 'create-project',
    href: '/projects/new',
    titleKey: 'commands.createProject',
    keywords: ['create project', 'new project', 'פרויקט', 'צור פרויקט'],
    allowed: (context) => hasPermission(context, PERMISSIONS.PROJECTS_CREATE),
  },
  {
    id: 'create-quote',
    href: '/quotes/new',
    titleKey: 'commands.createQuote',
    keywords: ['create quote', 'new quote', 'estimate', 'הצעת מחיר', 'אומדן'],
    allowed: (context, modules) =>
      Boolean(modules.quotes) && hasPermission(context, PERMISSIONS.QUOTES_MANAGE),
  },
  {
    id: 'open-today',
    href: '/today',
    titleKey: 'commands.openToday',
    keywords: ['today', 'inbox', 'היום', 'תיבת דואר'],
    allowed: (context) => hasPermission(context, PERMISSIONS.COMMAND_CENTER_READ),
  },
  {
    id: 'open-vendors',
    href: '/vendors',
    titleKey: 'commands.openVendors',
    keywords: ['vendors', 'suppliers', 'ספקים', 'קבלנים'],
    allowed: (context, modules) =>
      Boolean(modules.vendors) && hasPermission(context, PERMISSIONS.VENDORS_READ),
  },
  {
    id: 'open-clients',
    href: '/clients',
    titleKey: 'commands.openClients',
    keywords: ['clients', 'customers', 'לקוחות'],
    allowed: (context, modules) =>
      Boolean(modules.clients) && hasPermission(context, PERMISSIONS.CLIENTS_READ),
  },
  {
    id: 'open-ocr',
    href: '/documents/ocr-review',
    titleKey: 'commands.openOcr',
    keywords: ['ocr', 'scan', 'inbox', 'סריקה', 'חשבונית'],
    allowed: (context, modules) =>
      Boolean(modules.documents) && hasPermission(context, PERMISSIONS.DOCUMENTS_READ),
  },
  {
    id: 'open-reports',
    href: '/reports',
    titleKey: 'commands.openReports',
    keywords: ['reports', 'דוחות'],
    allowed: (context) => hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
  },
  {
    id: 'open-calendar',
    href: '/calendar',
    titleKey: 'commands.openCalendar',
    keywords: ['calendar', 'לוח שנה', 'יומן'],
    allowed: (context) => hasPermission(context, PERMISSIONS.SCHEDULING_READ),
  },
  {
    id: 'open-communications',
    href: '/communications',
    titleKey: 'commands.openCommunications',
    keywords: ['messages', 'communications', 'הודעות', 'דואל'],
    allowed: (context) => hasPermission(context, PERMISSIONS.COMMUNICATIONS_READ),
  },
  {
    id: 'open-warranty',
    href: '/warranty',
    titleKey: 'commands.openWarranty',
    keywords: ['warranty', 'אחריות'],
    allowed: (context) => hasPermission(context, PERMISSIONS.PROJECTS_READ),
  },
  {
    id: 'open-rfqs',
    href: '/procurement/rfqs',
    titleKey: 'commands.openRfqs',
    keywords: ['rfq', 'request for quote', 'procurement', 'quote request', 'בקשת הצעה', 'מכרז'],
    allowed: (context, modules) =>
      Boolean(modules.procurement) && hasPermission(context, PERMISSIONS.PROCUREMENT_READ),
  },
  {
    id: 'open-approvals',
    href: '/approvals',
    titleKey: 'commands.openApprovals',
    keywords: ['approvals', 'approve', 'אישורים'],
    allowed: (context, modules) =>
      Boolean(modules.approvals) && hasPermission(context, PERMISSIONS.APPROVALS_READ),
  },
  {
    id: 'open-forms',
    href: '/forms',
    titleKey: 'commands.openForms',
    keywords: ['forms', 'checklist', 'field forms', 'טפסים', 'צ׳קליסט'],
    allowed: (context, modules) =>
      Boolean(modules.forms) && hasPermission(context, PERMISSIONS.FORMS_READ),
  },
  {
    id: 'open-cash-flow',
    href: '/cash-flow',
    titleKey: 'commands.openCashFlow',
    keywords: ['cash flow', 'cashflow', 'תזרים'],
    allowed: (context) => hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function matchSearchCommands(
  query: string,
  context: OrgContext,
  modules: ModuleVisibility,
): SearchCommandHit[] {
  const raw = query.trim();
  if (raw.length < 2) return [];
  const needle = normalize(raw.replace(/^[/>>]+/, ''));
  const forceCommands = raw.startsWith('>') || raw.startsWith('/');
  const hits: SearchCommandHit[] = [];

  for (const command of COMMANDS) {
    if (!command.allowed(context, modules)) continue;
    const matched = command.keywords.some((keyword) => {
      const key = normalize(keyword);
      return key.includes(needle) || needle.includes(key);
    });
    if (matched || forceCommands) {
      hits.push({ id: command.id, titleKey: command.titleKey, href: command.href });
    }
  }

  if (!forceCommands) {
    return hits.filter((hit) => {
      const def = COMMANDS.find((item) => item.id === hit.id);
      return def?.keywords.some((keyword) => {
        const key = normalize(keyword);
        return key.includes(needle) || needle.includes(key);
      });
    });
  }

  return hits.slice(0, 8);
}

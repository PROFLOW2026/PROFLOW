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
    allowed: (context, modules) =>
      Boolean(modules.command_center) && hasPermission(context, PERMISSIONS.COMMAND_CENTER_READ),
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

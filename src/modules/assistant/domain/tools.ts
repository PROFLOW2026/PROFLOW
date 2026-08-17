import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  ASSISTANT_TOOL_KEYS,
  FORBIDDEN_ASSISTANT_FINANCIAL_ACTIONS,
  type AssistantCitation,
  type AssistantToolDefinition,
  type AssistantToolKey,
  type AssistantToolResult,
} from './types';

export const ASSISTANT_TOOL_CATALOG: readonly AssistantToolDefinition[] = [
  {
    key: 'today_attention',
    permission: PERMISSIONS.COMMAND_CENTER_READ,
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'explain_project_profit',
    permission: PERMISSIONS.PROJECT_PROFIT_READ,
    extraPermissions: [PERMISSIONS.PROJECT_FINANCIALS_READ],
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'clients_owing_money',
    permission: PERMISSIONS.BILLING_READ,
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'pay_this_week',
    permission: PERMISSIONS.AP_READ,
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'projects_at_risk',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'supplier_bills_needing_review',
    permission: PERMISSIONS.AP_READ,
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'forecast_over_budget',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'explain_number',
    permission: PERMISSIONS.PROJECT_FINANCIALS_READ,
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'find_document',
    permission: PERMISSIONS.DOCUMENTS_READ,
    extraPermissions: [PERMISSIONS.ORG_READ],
    draftOnly: false,
    financialMutation: false,
  },
  {
    key: 'prepare_draft_expense',
    permission: PERMISSIONS.EXPENSES_CREATE,
    draftOnly: true,
    financialMutation: false,
  },
  {
    key: 'prepare_payment_reminder_draft',
    permission: PERMISSIONS.COMMUNICATIONS_MANAGE,
    extraPermissions: [PERMISSIONS.BILLING_READ],
    draftOnly: true,
    financialMutation: false,
  },
];

export function getAssistantToolDefinition(key: string): AssistantToolDefinition | null {
  return ASSISTANT_TOOL_CATALOG.find((item) => item.key === key) ?? null;
}

export function isAssistantToolKey(value: string): value is AssistantToolKey {
  return (ASSISTANT_TOOL_KEYS as readonly string[]).includes(value);
}

export function isForbiddenAssistantFinancialAction(action: string): boolean {
  const normalized = action.trim().toLowerCase().replace(/\s+/g, '_');
  return (FORBIDDEN_ASSISTANT_FINANCIAL_ACTIONS as readonly string[]).some(
    (item) => normalized === item || normalized.includes(item),
  );
}

export function assertAssistantToolAllowed(context: OrgContext, toolKey: string): AssistantToolDefinition {
  if (isForbiddenAssistantFinancialAction(toolKey)) {
    throw new DomainRuleError(
      'The assistant cannot post, pay, approve, or release money',
      'assistant.errors.noPermission',
      { toolKey },
    );
  }
  const definition = getAssistantToolDefinition(toolKey);
  if (!definition) {
    throw new DomainRuleError('Unknown assistant tool', 'assistant.errors.noPermission', { toolKey });
  }
  if (!hasPermission(context, definition.permission)) {
    throw new AuthorizationError(definition.permission);
  }
  for (const extra of definition.extraPermissions ?? []) {
    if (!hasPermission(context, extra)) {
      throw new AuthorizationError(extra);
    }
  }
  if (definition.financialMutation !== false) {
    throw new DomainRuleError(
      'Assistant tools cannot mutate financial truth',
      'assistant.errors.noPermission',
      { toolKey },
    );
  }
  return definition;
}

const TOOL_HINTS: Readonly<Record<AssistantToolKey, readonly string[]>> = {
  today_attention: ['today', 'היום', 'attention', 'inbox', 'מה דורש', 'attention today'],
  explain_project_profit: ['profit', 'רווח', 'margin', 'מרווח', 'explain project'],
  clients_owing_money: ['owing', 'overdue', 'receivable', 'חייב', 'יתרת לקוח', 'clients owing'],
  pay_this_week: ['pay this week', 'ap', 'לשלם השבוע', 'ספקים לשלם', 'bills to pay'],
  projects_at_risk: ['at risk', 'בסיכון', 'warning', 'forecast risk'],
  supplier_bills_needing_review: ['supplier bill', 'חשבונית ספק', 'vendor bill', 'review bill'],
  forecast_over_budget: ['over budget', 'מעל התקציב', 'forecast over'],
  explain_number: ['explain number', 'הסבר מספר', 'what is this number'],
  find_document: ['document', 'מסמך', 'find file', 'קובץ'],
  prepare_draft_expense: ['draft expense', 'טיוטת הוצאה', 'prepare expense'],
  prepare_payment_reminder_draft: ['reminder', 'תזכורת תשלום', 'payment reminder'],
};

const PROJECT_ID_IN_HREF = /(?:\/projects\/|projectId=)([0-9a-f-]{36})/i;

function projectIdsFromCitations(citations: readonly AssistantCitation[]): string[] {
  const ids: string[] = [];
  for (const citation of citations) {
    const match = citation.href?.match(PROJECT_ID_IN_HREF);
    if (match?.[1]) ids.push(match[1]);
  }
  return ids;
}

export function collectAssistantAccessScope(
  toolResults: readonly AssistantToolResult[],
  projectId?: string,
): {
  readonly permissions: readonly string[];
  readonly projectIds: readonly string[];
  readonly documentIds: readonly string[];
} {
  const permissions = new Set<string>();
  const projectIds = new Set<string>();
  const documentIds = new Set<string>();
  for (const result of toolResults) {
    if (!result.ok || result.permissionDenied) continue;
    const definition = getAssistantToolDefinition(result.tool);
    if (!definition) continue;
    permissions.add(definition.permission);
    for (const extra of definition.extraPermissions ?? []) {
      permissions.add(extra);
    }
    if (projectId) projectIds.add(projectId);
    for (const id of result.accessProjectIds ?? []) projectIds.add(id);
    for (const id of projectIdsFromCitations(result.citations)) projectIds.add(id);
    for (const id of result.accessDocumentIds ?? []) documentIds.add(id);
  }
  return {
    permissions: [...permissions],
    projectIds: [...projectIds],
    documentIds: [...documentIds],
  };
}

export function selectAssistantTools(question: string): AssistantToolKey[] {
  const haystack = question.trim().toLowerCase();
  if (!haystack) return ['today_attention'];
  const matched = ASSISTANT_TOOL_KEYS.filter((key) =>
    TOOL_HINTS[key].some((hint) => haystack.includes(hint.toLowerCase())),
  );
  if (matched.length > 0) return matched;
  return ['today_attention'];
}

import type { PermissionKey } from '@/shared/permissions/catalog';

export const ASSISTANT_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type AssistantMessageRole = (typeof ASSISTANT_MESSAGE_ROLES)[number];

export const ASSISTANT_CLAIM_KINDS = ['fact', 'inference'] as const;
export type AssistantClaimKind = (typeof ASSISTANT_CLAIM_KINDS)[number];

export const ASSISTANT_TOOL_KEYS = [
  'today_attention',
  'explain_project_profit',
  'clients_owing_money',
  'pay_this_week',
  'projects_at_risk',
  'supplier_bills_needing_review',
  'forecast_over_budget',
  'explain_number',
  'find_document',
  'prepare_draft_expense',
  'prepare_payment_reminder_draft',
] as const;
export type AssistantToolKey = (typeof ASSISTANT_TOOL_KEYS)[number];

export const FORBIDDEN_ASSISTANT_FINANCIAL_ACTIONS = [
  'post',
  'finalize',
  'pay',
  'approve',
  'release_retention',
  'modify_contract',
  'receive_payment',
] as const;

export interface AssistantCitation {
  readonly label: string;
  readonly href: string | null;
  readonly claimKind: AssistantClaimKind;
}

export interface AssistantToolResult {
  readonly tool: AssistantToolKey;
  readonly ok: boolean;
  readonly claimKind: AssistantClaimKind;
  readonly title: string;
  readonly body: string;
  readonly citations: readonly AssistantCitation[];
  readonly draftOnly?: boolean;
  readonly permissionDenied?: boolean;
  readonly accessProjectIds?: readonly string[];
  readonly accessDocumentIds?: readonly string[];
}

export interface AssistantToolDefinition {
  readonly key: AssistantToolKey;
  readonly permission: PermissionKey;
  readonly extraPermissions?: readonly PermissionKey[];
  readonly draftOnly: boolean;
  readonly financialMutation: false;
}

export interface AssistantConversationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly title: string | null;
  readonly status: 'active' | 'archived';
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AssistantMessageRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly conversationId: string;
  readonly role: AssistantMessageRole;
  readonly content: string;
  readonly citations: readonly AssistantCitation[];
  readonly createdAt: Date;
}

export interface AssistantProviderStatus {
  readonly configured: boolean;
  readonly connected: false;
  readonly messageKey: string;
}

export interface AssistantCompletionInput {
  readonly question: string;
  readonly toolResults: readonly AssistantToolResult[];
  readonly locale: string;
}

export interface AssistantCompletionOutput {
  readonly content: string;
  readonly citations: readonly AssistantCitation[];
}

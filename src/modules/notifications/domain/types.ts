/**
 * Central in-app notifications. Delivery is in-app only; email/push are reserved.
 */

export const NOTIFICATION_SEVERITIES = ['info', 'warning', 'urgent'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_EVENT_TYPES = [
  'billing_overdue',
  'ap_due_soon',
  'ap_overdue',
  'approval_waiting',
  'timesheet_waiting',
  'employee_missing_report',
  'document_expiring',
  'task_overdue',
  'boq_awaiting_approval',
  'work_order_assigned',
  'punch_assigned',
  'low_stock',
  'safety_action_due',
  'warranty_expiring',
  'closeout_blockers',
  'communication_failed',
  'automation_output',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export const NOTIFICATION_DOMAINS = [
  'billing',
  'ap',
  'approvals',
  'workforce',
  'documents',
  'planning',
  'boq',
  'service',
  'field_ops',
  'inventory',
  'safety',
  'warranty',
  'closeout',
  'communications',
  'automations',
] as const;
export type NotificationDomain = (typeof NOTIFICATION_DOMAINS)[number];

export const EVENT_DOMAIN: Readonly<Record<NotificationEventType, NotificationDomain>> = {
  billing_overdue: 'billing',
  ap_due_soon: 'ap',
  ap_overdue: 'ap',
  approval_waiting: 'approvals',
  timesheet_waiting: 'workforce',
  employee_missing_report: 'workforce',
  document_expiring: 'documents',
  task_overdue: 'planning',
  boq_awaiting_approval: 'boq',
  work_order_assigned: 'service',
  punch_assigned: 'field_ops',
  low_stock: 'inventory',
  safety_action_due: 'safety',
  warranty_expiring: 'warranty',
  closeout_blockers: 'closeout',
  communication_failed: 'communications',
  automation_output: 'automations',
};

export function isNotificationSeverity(value: string): value is NotificationSeverity {
  return (NOTIFICATION_SEVERITIES as readonly string[]).includes(value);
}

export function isNotificationEventType(value: string): value is NotificationEventType {
  return (NOTIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

export interface NotificationRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly recipientUserId: string;
  readonly type: NotificationEventType;
  readonly domain: NotificationDomain;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly title: string;
  readonly body: string;
  readonly severity: NotificationSeverity;
  readonly deepLink: string | null;
  readonly dedupeKey: string;
  readonly readAt: Date | null;
  readonly dismissedAt: Date | null;
  readonly resolvedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NotificationListItem {
  readonly id: string;
  readonly type: NotificationEventType;
  readonly domain: NotificationDomain;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly title: string;
  readonly body: string;
  readonly severity: NotificationSeverity;
  readonly deepLink: string | null;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface NotificationInbox {
  readonly items: readonly NotificationListItem[];
  readonly unreadCount: number;
}

export interface EmitNotificationInput {
  readonly recipientUserId: string;
  readonly type: NotificationEventType;
  readonly title: string;
  readonly body: string;
  readonly dedupeKey: string;
  readonly severity?: NotificationSeverity;
  readonly entityType?: string | null;
  readonly entityId?: string | null;
  readonly deepLink?: string | null;
  readonly metadata?: Record<string, unknown> | null;
  readonly expiresAt?: Date | null;
}

export interface NotificationScanResult {
  readonly scannersRun: number;
  readonly emitted: number;
  readonly resolved: number;
  readonly skipped: readonly string[];
}

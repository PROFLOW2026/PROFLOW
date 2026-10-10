import type { PortalNotificationSource } from '../domain/notifications';
import type { PortalSectionProvider } from '../domain/sections';
import {
  certificationsProvider,
  openClaimsProvider,
  paymentsProvider,
  retentionProvider,
} from './providers/claims';
import { certifiedCashFlowProvider } from './providers/cash-flow';
import {
  coordinationAcknowledgementProvider,
  coordinationScheduleProvider,
  coordinationTodayProvider,
} from './providers/coordination';
import { milestonesProvider } from './providers/milestones';
import { externalNotificationSource, recentNotificationsProvider } from './providers/notifications';
import { planAcknowledgementProvider, planRevisionsProvider, sharedDocumentsProvider } from './providers/plans';
import { defectSummaryProvider, rfiSummaryProvider } from './providers/quality-rfi';
import { siteInstructionAcknowledgementProvider } from './providers/site-instructions';
import { submittalsProvider } from './providers/submittals';
import { openTasksProvider, overdueTasksProvider, todayTasksProvider } from './providers/tasks';

/**
 * Registered dashboard providers - one adapter per domain portal summary export. A section with no
 * registered provider stays hidden (never a placeholder).
 */
export const PORTAL_SECTION_PROVIDERS: readonly PortalSectionProvider[] = [
  coordinationTodayProvider,
  todayTasksProvider,
  coordinationScheduleProvider,
  milestonesProvider,
  coordinationAcknowledgementProvider,
  siteInstructionAcknowledgementProvider,
  planAcknowledgementProvider,
  openTasksProvider,
  overdueTasksProvider,
  planRevisionsProvider,
  rfiSummaryProvider,
  defectSummaryProvider,
  submittalsProvider,
  openClaimsProvider,
  certificationsProvider,
  retentionProvider,
  paymentsProvider,
  certifiedCashFlowProvider,
  sharedDocumentsProvider,
  recentNotificationsProvider,
];

/** External notification center (Track T). */
export const PORTAL_NOTIFICATION_SOURCE: PortalNotificationSource | null = externalNotificationSource;

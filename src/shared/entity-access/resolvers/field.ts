import { and, eq } from 'drizzle-orm';
import { punchListItems, siteDailyLogs, siteDailyReports, siteInstructions, siteMeetingDetails } from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'field' track. One resolver per entity type that supports threads/attachments/evidence. */
export const FIELD_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    // The internal log names every contractor on site: never contractor-visible.
    entityType: 'daily_log',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({ projectId: siteDailyLogs.projectId })
        .from(siteDailyLogs)
        .where(and(eq(siteDailyLogs.id, entityId), eq(siteDailyLogs.organizationId, organizationId)))
        .limit(1);
      return row ? { organizationId, projectId: row.projectId, vendorId: null, internalOnly: true } : null;
    },
  },
  {
    entityType: 'site_daily_report',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: siteDailyReports.projectId,
          vendorId: siteDailyReports.vendorId,
          agreementId: siteDailyReports.subcontractAgreementId,
        })
        .from(siteDailyReports)
        .where(and(eq(siteDailyReports.id, entityId), eq(siteDailyReports.organizationId, organizationId)))
        .limit(1);
      return row
        ? {
            organizationId,
            projectId: row.projectId,
            vendorId: row.vendorId,
            subcontractAgreementId: row.agreementId,
          }
        : null;
    },
  },
  {
    // Multi-contractor meeting: attachments are internal; contractors read published minutes instead.
    entityType: 'site_meeting',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({ projectId: siteMeetingDetails.projectId })
        .from(siteMeetingDetails)
        .where(and(eq(siteMeetingDetails.meetingId, entityId), eq(siteMeetingDetails.organizationId, organizationId)))
        .limit(1);
      return row ? { organizationId, projectId: row.projectId, vendorId: null, internalOnly: true } : null;
    },
  },
  {
    entityType: 'punch_list_item',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({ projectId: punchListItems.projectId })
        .from(punchListItems)
        .where(and(eq(punchListItems.id, entityId), eq(punchListItems.organizationId, organizationId)))
        .limit(1);
      return row ? { organizationId, projectId: row.projectId, vendorId: null } : null;
    },
  },
  {
    entityType: 'site_instruction',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: siteInstructions.projectId,
          vendorId: siteInstructions.vendorId,
          agreementId: siteInstructions.subcontractAgreementId,
        })
        .from(siteInstructions)
        .where(and(eq(siteInstructions.id, entityId), eq(siteInstructions.organizationId, organizationId)))
        .limit(1);
      return row
        ? {
            organizationId,
            projectId: row.projectId,
            vendorId: row.vendorId,
            subcontractAgreementId: row.agreementId,
          }
        : null;
    },
  },
];

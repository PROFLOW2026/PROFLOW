import 'server-only';

import { and, eq } from 'drizzle-orm';
import { defects, punchListItems, rfis, siteInstructions, submittals } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function resolveRelatedEntityLabel(
  db: DbExecutor,
  organizationId: string,
  entityType: string,
  entityId: string,
  fallbackProjectId: string | null,
): Promise<{ label: string; projectId: string | null }> {
  switch (entityType) {
    case 'rfi': {
      const [row] = await db
        .select({ subject: rfis.subject, number: rfis.number, projectId: rfis.projectId })
        .from(rfis)
        .where(and(eq(rfis.organizationId, organizationId), eq(rfis.id, entityId)))
        .limit(1);
      if (!row) return { label: `RFI ${entityId.slice(0, 8)}`, projectId: fallbackProjectId };
      return { label: `RFI ${row.number}: ${row.subject}`, projectId: row.projectId };
    }
    case 'submittal': {
      const [row] = await db
        .select({ title: submittals.title, projectId: submittals.projectId })
        .from(submittals)
        .where(and(eq(submittals.organizationId, organizationId), eq(submittals.id, entityId)))
        .limit(1);
      if (!row) return { label: `Submittal ${entityId.slice(0, 8)}`, projectId: fallbackProjectId };
      return { label: row.title, projectId: row.projectId };
    }
    case 'punch_list_item': {
      const [row] = await db
        .select({ title: punchListItems.title, projectId: punchListItems.projectId })
        .from(punchListItems)
        .where(and(eq(punchListItems.organizationId, organizationId), eq(punchListItems.id, entityId)))
        .limit(1);
      if (!row) return { label: `Punch ${entityId.slice(0, 8)}`, projectId: fallbackProjectId };
      return { label: row.title, projectId: row.projectId };
    }
    case 'defect': {
      const [row] = await db
        .select({ title: defects.title, projectId: defects.projectId })
        .from(defects)
        .where(and(eq(defects.organizationId, organizationId), eq(defects.id, entityId)))
        .limit(1);
      if (!row) return { label: `Defect ${entityId.slice(0, 8)}`, projectId: fallbackProjectId };
      return { label: row.title, projectId: row.projectId };
    }
    case 'site_instruction': {
      const [row] = await db
        .select({ title: siteInstructions.title, projectId: siteInstructions.projectId })
        .from(siteInstructions)
        .where(and(eq(siteInstructions.organizationId, organizationId), eq(siteInstructions.id, entityId)))
        .limit(1);
      if (!row) return { label: `Instruction ${entityId.slice(0, 8)}`, projectId: fallbackProjectId };
      return { label: row.title, projectId: row.projectId };
    }
    default:
      return {
        label: `${entityType.replace(/_/g, ' ')} · ${entityId.slice(0, 8)}`,
        projectId: fallbackProjectId,
      };
  }
}

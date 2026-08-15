import { and, eq, isNull } from 'drizzle-orm';
import {
  dailyLogs,
  inspections,
  maintenanceRecords,
  planningWorkItems,
  projects,
} from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import type { FormOwnerType } from '../domain/types';

/**
 * Verify the form owner exists in-org.
 * project / job / work_order → projects.work_kind
 * planning_task → planning_work_items
 * maintenance → maintenance_records
 * field_log → daily_logs
 * inspection → inspections
 */
export async function assertFormOwnerExists(
  context: OrgContext,
  ownerType: FormOwnerType,
  ownerId: string,
): Promise<void> {
  const { db, organizationId } = context;

  if (ownerType === 'project' || ownerType === 'job' || ownerType === 'work_order') {
    const [row] = await db
      .select({ id: projects.id, workKind: projects.workKind })
      .from(projects)
      .where(
        and(
          eq(projects.id, ownerId),
          eq(projects.organizationId, organizationId),
          isNull(projects.archivedAt),
        ),
      )
      .limit(1);
    if (!row || row.workKind !== ownerType) {
      throw new NotFoundError('Form owner');
    }
    return;
  }

  if (ownerType === 'planning_task') {
    const [row] = await db
      .select({ id: planningWorkItems.id })
      .from(planningWorkItems)
      .where(
        and(
          eq(planningWorkItems.id, ownerId),
          eq(planningWorkItems.organizationId, organizationId),
          isNull(planningWorkItems.archivedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Planning task');
    return;
  }

  if (ownerType === 'maintenance') {
    const [row] = await db
      .select({ id: maintenanceRecords.id })
      .from(maintenanceRecords)
      .where(
        and(
          eq(maintenanceRecords.id, ownerId),
          eq(maintenanceRecords.organizationId, organizationId),
          isNull(maintenanceRecords.archivedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Maintenance record');
    return;
  }

  if (ownerType === 'inspection') {
    const [row] = await db
      .select({ id: inspections.id })
      .from(inspections)
      .where(
        and(
          eq(inspections.id, ownerId),
          eq(inspections.organizationId, organizationId),
          isNull(inspections.archivedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundError('Inspection');
    return;
  }

  // field_log
  const [row] = await db
    .select({ id: dailyLogs.id })
    .from(dailyLogs)
    .where(
      and(
        eq(dailyLogs.id, ownerId),
        eq(dailyLogs.organizationId, organizationId),
        isNull(dailyLogs.archivedAt),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError('Field log');
}

/**
 * Map form owner to a documents module owner when possible.
 * Photos reuse documents — form_submission owner type is a SCHEMA_REQUEST gap.
 */
export function documentOwnerForFormOwner(
  ownerType: FormOwnerType,
  ownerId: string,
): { ownerType: 'project' | 'daily_log' | 'inspection'; ownerId: string } | null {
  if (ownerType === 'project' || ownerType === 'job' || ownerType === 'work_order') {
    return { ownerType: 'project', ownerId };
  }
  if (ownerType === 'field_log') {
    return { ownerType: 'daily_log', ownerId };
  }
  if (ownerType === 'inspection') {
    return { ownerType: 'inspection', ownerId };
  }
  return null;
}

import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import type { DuplicateWarningRepository } from '../domain/gate';
import type { DuplicateWarningType, StoredDuplicateWarning } from '../domain/snapshot';

type AckRow = {
  id: string;
  warning_type: string;
  snapshot_hash: string;
  status: string;
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function asStored(row: AckRow): StoredDuplicateWarning {
  return {
    id: row.id,
    warningType: row.warning_type as DuplicateWarningType,
    snapshotHash: row.snapshot_hash,
    status: row.status === 'acknowledged' ? 'acknowledged' : 'pending',
  };
}

export function duplicateWarningRepository(db: DbExecutor): DuplicateWarningRepository {
  return {
    async listForCase(organizationId, caseKey) {
      const result = await db.execute(sql`
        select id, warning_type, snapshot_hash, status
        from public.duplicate_warning_acknowledgements
        where organization_id = ${organizationId}::uuid
          and case_key = ${caseKey}
      `);
      return rowsOf<AckRow>(result).map(asStored);
    },

    async upsertPending(input) {
      const result = await db.execute(sql`
        insert into public.duplicate_warning_acknowledgements (
          organization_id, case_key, record_id, warning_type, snapshot_hash, status
        ) values (
          ${input.organizationId}::uuid,
          ${input.caseKey},
          ${input.recordId}::uuid,
          ${input.warningType},
          ${input.snapshotHash},
          'pending'
        )
        on conflict (organization_id, case_key, warning_type, snapshot_hash)
        do update set record_id = excluded.record_id
        returning id, status
      `);
      const row = rowsOf<{ id: string; status: string }>(result)[0];
      if (!row) throw new Error('duplicate warning pending row was not stored');
      return {
        id: row.id,
        status: row.status === 'acknowledged' ? 'acknowledged' : 'pending',
      };
    },

    async acknowledge(input) {
      const inserted = await db.execute(sql`
        insert into public.duplicate_warning_acknowledgements (
          organization_id, case_key, record_id, warning_type, snapshot_hash, status
        ) values (
          ${input.organizationId}::uuid,
          ${input.caseKey},
          ${input.recordId}::uuid,
          ${input.warningType},
          ${input.snapshotHash},
          'pending'
        )
        on conflict (organization_id, case_key, warning_type, snapshot_hash)
        do update set record_id = excluded.record_id
        returning id, status
      `);
      const existing = rowsOf<{ id: string; status: string }>(inserted)[0];
      if (!existing) throw new Error('duplicate warning acknowledgement row was not stored');
      if (existing.status === 'acknowledged') {
        return { id: existing.id, status: 'acknowledged' as const };
      }

      const updated = await db.execute(sql`
        update public.duplicate_warning_acknowledgements
        set status = 'acknowledged',
            approver_user_id = ${input.approverUserId}::uuid,
            acknowledged_at = now()
        where id = ${existing.id}::uuid
          and organization_id = ${input.organizationId}::uuid
          and status = 'pending'
        returning id, status
      `);
      const row = rowsOf<{ id: string; status: string }>(updated)[0];
      if (!row) return { id: existing.id, status: 'pending' as const };
      return { id: row.id, status: 'acknowledged' as const };
    },
  };
}
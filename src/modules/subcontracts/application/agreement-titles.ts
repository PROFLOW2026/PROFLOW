import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { listProjectAgreementsOperational } from '../data/agreements.repository';

/** Agreement id and title only. No money columns and no portal grants. */
export async function listProjectAgreementTitles(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ReadonlyArray<{ readonly id: string; readonly title: string }>> {
  const rows = await listProjectAgreementsOperational(db, organizationId, projectId);
  return rows.map((row) => ({ id: row.id, title: row.title }));
}

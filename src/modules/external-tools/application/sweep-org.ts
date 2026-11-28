import 'server-only';

import { getAdminDb } from '@/shared/db/client';
import { externalSchemaAvailable } from '../infrastructure/schema-gate';
import { purgeExternalSessions } from '../infrastructure/postgres-session';

/** Org-entry cleanup. Independent of PF_EXTERNAL_TOOLS; no-ops until 0217 is on this process. */
export async function sweepOrgExternalTools(organizationId: string, now = new Date()): Promise<void> {
  if (!(await externalSchemaAvailable())) return;
  try {
    await purgeExternalSessions(getAdminDb(), organizationId, now);
  } catch {
    /* best-effort ledger cleanup */
  }
}

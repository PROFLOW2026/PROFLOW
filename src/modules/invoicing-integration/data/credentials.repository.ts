import 'server-only';

import { sql } from 'drizzle-orm';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { DbExecutor } from '@/shared/db/types';
import {
  openInvoicingCredentials,
  sealInvoicingCredentials,
} from '../application/credential-seal';
import type { InvoicingProviderCredentials } from '../domain/types';
function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

async function writeInvoicingConnectionCredentials(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    credentials: InvoicingProviderCredentials;
  },
): Promise<void> {
  const sealed = sealInvoicingCredentials(input.credentials);
  await db.execute(sql`
    INSERT INTO app.invoicing_provider_credential_refs (
      organization_id, connection_id, credentials_ref
    ) VALUES (
      ${input.organizationId}::uuid,
      ${input.connectionId}::uuid,
      ${sealed}
    )
    ON CONFLICT (connection_id) DO UPDATE SET
      credentials_ref = EXCLUDED.credentials_ref,
      updated_at = now()
  `);
}

/** Persists credentials in the caller transaction (same commit as connection row). */
export async function saveInvoicingConnectionCredentials(
  db: DbExecutor,
  input: {
    organizationId: string;
    connectionId: string;
    credentials: InvoicingProviderCredentials;
  },
): Promise<void> {
  await asServiceRoleWrite(db, async () => writeInvoicingConnectionCredentials(db, input));
}

export async function loadInvoicingConnectionCredentials(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<InvoicingProviderCredentials | null> {
  return asServiceRoleWrite(db, async () => {
    const result = await db.execute(sql`
      SELECT credentials_ref
      FROM app.invoicing_provider_credential_refs
      WHERE organization_id = ${organizationId}::uuid
        AND connection_id = ${connectionId}::uuid
      LIMIT 1
    `);
    const row = sqlResultRows<{ credentials_ref: string }>(result)[0];
    if (!row?.credentials_ref) return null;
    return openInvoicingCredentials(row.credentials_ref);
  });
}

export async function deleteInvoicingConnectionCredentials(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<void> {
  await asServiceRoleWrite(db, async () => {
    await db.execute(sql`
      DELETE FROM app.invoicing_provider_credential_refs
      WHERE organization_id = ${organizationId}::uuid
        AND connection_id = ${connectionId}::uuid
    `);
  });
}

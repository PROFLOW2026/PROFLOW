/**
 * AP attachment → external storage (no browser OAuth).
 * Creates a draft AP bill, uploads via production document/storage services,
 * verifies OneDrive + DB metadata, then removes test data.
 *
 *   $env:NODE_OPTIONS="--import ./tests/e2e/harness/alias-server-only.mjs"
 *   npx tsx scripts/verify-ap-external-attachment.ts
 */
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const ORG_ID = process.env.ORG_ID?.trim() ?? '7dec19cf-ef7a-4f62-a110-615da62f3823';
const PROJECT_ID = process.env.PROJECT_ID?.trim() ?? '1800f2d6-5cad-46bb-816a-e57a3a5dd1af';
const TEST_REF = `PF-STORAGE-AP-${Date.now()}`;
const TEST_FILE = `${TEST_REF}.png`;

const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

async function withOrgContext<T>(organizationId: string, fn: (context: OrgContext) => Promise<T>): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT om.user_id FROM organization_memberships om
    WHERE om.status = 'active' AND om.organization_id = ${organizationId}
    ORDER BY om.created_at ASC LIMIT 1
  `);
  const row = rows[0] as { user_id: string };
  return withUserContext(row.user_id, async (tx) => {
    const resolved = await resolveOrgContext(tx, { userId: row.user_id, organizationId, locale: 'he-IL' });
    const snapshot = toOrgAuthzSnapshot(resolved);
    return runInOrgRequestTxFrame({ tx: tx as never, snapshot }, () =>
      fn(orgContextFromAuthzSnapshot(snapshot, { userId: row.user_id, locale: 'he-IL', db: tx })),
    );
  });
}

type StepResult = {
  apBillId: string;
  documentId: string;
  externalFileId: string;
  semanticFolder: string;
  vendorInvoicesFolderId: string;
  storageBackend: string;
  oneDriveListed: boolean;
  downloadOk: boolean;
};

async function main() {
  const result = await withOrgContext(ORG_ID, async (context) => {
    const { vendors } = await import('@drizzle/schema');
    const [vendor] = await context.db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.organizationId, context.organizationId))
      .limit(1);
    if (!vendor) throw new Error('No vendor in org — cannot create test AP bill');

    const billId = randomUUID();
    const { getAdminDb } = await import('@/shared/db/client');
    const admin = getAdminDb();
    await admin.execute(sql`
      INSERT INTO ap_bills (
        id, organization_id, vendor_id, project_id, reference, status, currency,
        total_amount, net_amount, tax_amount, gross_amount, tax_basis
      ) VALUES (
        ${billId}::uuid, ${context.organizationId}::uuid, ${vendor.id}::uuid, ${PROJECT_ID}::uuid,
        ${TEST_REF}, 'draft', 'ILS', 1, 1, 0, 1, 'zero_exempt'
      )
    `);
    const bill = { id: billId };

    const { semanticFolderForDocumentOwner } = await import('@/modules/external-storage/domain/semantic-folders');
    const semanticFolder = semanticFolderForDocumentOwner('ap_bill');
    if (semanticFolder !== 'vendor_invoices') {
      throw new Error(`Expected vendor_invoices semantic folder, got ${semanticFolder}`);
    }

    const { resolveUploadFolderEntityContext } = await import(
      '@/modules/external-storage/application/resolve-upload-folder-context'
    );
    const folderEntity = await resolveUploadFolderEntityContext(
      context.db,
      context.organizationId,
      'ap_bill',
      bill.id,
    );
    if (folderEntity.entityType !== 'project' || folderEntity.entityId !== PROJECT_ID) {
      throw new Error(`AP folder entity mismatch: ${JSON.stringify(folderEntity)}`);
    }

    const { prepareDocumentUpload } = await import('@/modules/documents/application/upload-document');
    const { finalizeDocumentUpload } = await import('@/modules/documents/application/manage-document');
    const prepared = await prepareDocumentUpload(context, {
      fileName: TEST_FILE,
      mimeType: 'image/png',
      sizeBytes: PNG_1X1.length,
      ownerType: 'ap_bill',
      ownerId: bill.id,
    });
    if (prepared.uploadMode !== 'external' || !prepared.uploadUrl.includes('/api/org-storage/upload/')) {
      throw new Error('prepareDocumentUpload did not return external upload mode');
    }

    const { uploadDocumentToExternalStorage } = await import(
      '@/modules/external-storage/application/file-service'
    );
    const uploaded = await uploadDocumentToExternalStorage(context, {
      documentId: prepared.document.id,
      parentSemanticFolder: semanticFolder,
      entityType: folderEntity.entityType,
      entityId: folderEntity.entityId,
      fileName: TEST_FILE,
      mimeType: 'image/png',
      body: PNG_1X1,
      sizeBytes: PNG_1X1.length,
    });

    await finalizeDocumentUpload(context, {
      documentId: prepared.document.id,
      sizeBytes: PNG_1X1.length,
    });

    const { findDocumentById } = await import('@/modules/documents/data/documents.repository');
    const { findStorageFileByDocumentId } = await import('@/modules/external-storage/data/files.repository');
    const { findFolderMapping } = await import('@/modules/external-storage/data/folder-mappings.repository');
    const { assertOrganizationStorageAvailable, resolveValidAccessToken } = await import(
      '@/modules/external-storage/application/connection-service'
    );
    const { getStorageProviderAdapter } = await import('@/modules/external-storage/providers/registry');
    const { getExternalDocumentDownload } = await import('@/modules/external-storage/application/file-service');

    const doc = await findDocumentById(context.db, context.organizationId, prepared.document.id);
    const storageFile = await findStorageFileByDocumentId(
      context.db,
      context.organizationId,
      prepared.document.id,
    );
    if (!doc || doc.storageBackend !== 'external' || !doc.externalFileId || doc.status !== 'available') {
      throw new Error('Document external metadata incomplete after finalize');
    }
    if (!storageFile || storageFile.externalFileId !== uploaded.id) {
      throw new Error('storage_files row missing or mismatched external id');
    }

    const connection = await assertOrganizationStorageAvailable(context);
    const mapping = await findFolderMapping(context.db, {
      organizationId: context.organizationId,
      connectionId: connection.id,
      semanticFolderType: 'vendor_invoices',
      entityType: 'project',
      entityId: PROJECT_ID,
    });
    if (!mapping?.externalFolderId) throw new Error('vendor_invoices folder mapping missing');

    const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
    const adapter = getStorageProviderAdapter(connection.provider);
    const listing = await adapter.listFolder(accessToken, mapping.externalFolderId);
    const oneDriveListed = listing.files.some((f) => f.id === uploaded.id || f.name === TEST_FILE);

    const download = await getExternalDocumentDownload(context, doc.id);
    const downloadOk = 'url' in download || 'stream' in download;

    return {
      apBillId: bill.id,
      documentId: doc.id,
      externalFileId: uploaded.id,
      semanticFolder,
      vendorInvoicesFolderId: mapping.externalFolderId,
      storageBackend: doc.storageBackend,
      oneDriveListed,
      downloadOk,
    } satisfies StepResult;
  });

  await cleanup(result);

  console.log(
    JSON.stringify(
      {
        ok: true,
        method: 'service_path_with_onedrive_verify',
        reference: TEST_REF,
        ...result,
      },
      null,
      2,
    ),
  );
}

async function cleanup(result: StepResult) {
  await withOrgContext(ORG_ID, async (context) => {
    const { documentLinks, documents, storageFiles, apBills } = await import('@drizzle/schema');
    const { assertOrganizationStorageAvailable, resolveValidAccessToken } = await import(
      '@/modules/external-storage/application/connection-service'
    );
    const { getStorageProviderAdapter } = await import('@/modules/external-storage/providers/registry');

    try {
      const connection = await assertOrganizationStorageAvailable(context);
      const accessToken = await resolveValidAccessToken(context.db, context.organizationId, connection);
      const adapter = getStorageProviderAdapter(connection.provider);
      await adapter.deleteFile(accessToken, result.externalFileId);
    } catch {
      // Best-effort OneDrive cleanup
    }

    await context.db
      .delete(documentLinks)
      .where(
        and(
          eq(documentLinks.organizationId, context.organizationId),
          eq(documentLinks.documentId, result.documentId),
        ),
      );
    await context.db
      .delete(storageFiles)
      .where(
        and(
          eq(storageFiles.organizationId, context.organizationId),
          eq(storageFiles.documentId, result.documentId),
        ),
      );
    await context.db
      .delete(documents)
      .where(and(eq(documents.organizationId, context.organizationId), eq(documents.id, result.documentId)));
    await context.db
      .delete(apBills)
      .where(and(eq(apBills.organizationId, context.organizationId), eq(apBills.id, result.apBillId)));
  });
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 8) : undefined,
    }),
  );
  process.exit(1);
});

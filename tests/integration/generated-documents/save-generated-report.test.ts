import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReportsModule from '@/modules/reports';

vi.mock('server-only', () => ({}));

vi.mock('@/modules/reports', async (importOriginal) => {
  const actual = await importOriginal<typeof ReportsModule>();
  return {
    ...actual,
    generateReport: vi.fn().mockResolvedValue({
      kind: 'monthly_workforce_report',
      title: 'דוח עובדים חודשי',
      generatedAt: new Date().toISOString(),
      locale: 'he-IL',
      dir: 'rtl',
      identity: {
        companyName: 'חברת בדיקה',
        projectId: null,
        projectName: null,
        projectNumber: null,
        clientName: null,
        extra: '2026-08',
      },
      sections: [
        {
          id: 'summary',
          heading: 'סיכום חודש',
          rows: [{ label: 'חודש דיווח', value: '2026-08' }],
        },
      ],
      notices: ['דוח עובדים לחודש 2026-08.'],
      omitted: { compensation: true },
    }),
  };
});

import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { listVersions } from '@/modules/documents/application/manage-versions';
import { findDocumentById } from '@/modules/documents/data/documents.repository';
import { findStorageFileByDocumentId } from '@/modules/external-storage/data/files.repository';
import { getExternalDocumentDownload } from '@/modules/external-storage/server';
import { saveGeneratedReportToStorage } from '@/modules/generated-documents/application/save-generated-report';
import * as uploadFolderModule from '@/modules/generated-documents/application/resolve-upload-folder';
import { listCommandCenterItemStates } from '@/modules/command-center/data/item-states.repository';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import {
  installExternalStorageServerMocks,
  restoreExternalStorageServerMocks,
  seedOrganizationStorageConnection,
} from '../../setup/external-storage-fixture';
import { createTestUser, seedSystem } from '../../setup/fixtures';

const PROVIDERS = ['onedrive', 'google_drive', 'dropbox'] as const;

async function provisionTenant(
  database: TestDatabase,
  email: string,
  provider: (typeof PROVIDERS)[number],
) {
  await seedSystem(database);
  const owner = await createTestUser(database, email);
  const result = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name: `GenDocs ${provider}`, countryCode: 'IL' }),
  );
  await database.asService(async (db) => {
    await seedOrganizationStorageConnection(db, result.organization.id, owner.id, provider);
  });
  return { owner, organizationId: result.organization.id };
}

describe('saveGeneratedReportToStorage integration', () => {
  let database: TestDatabase;
  let folderSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    database = await createTestDatabase();
    installExternalStorageServerMocks();
    folderSpy = vi
      .spyOn(uploadFolderModule, 'resolveGeneratedUploadFolderId')
      .mockResolvedValue('generated-folder-id');
  });

  afterAll(async () => {
    folderSpy.mockRestore();
    restoreExternalStorageServerMocks();
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    folderSpy.mockClear();
  });

  for (const provider of PROVIDERS) {
    it(`persists generated PDF via ${provider} adapter path`, async () => {
      const org = await provisionTenant(database, `owner-${provider}@example.test`, provider);

      await database.asUser(org.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: org.owner.id,
          organizationId: org.organizationId,
          locale: 'he-IL',
        });

        const result = await saveGeneratedReportToStorage(context, {
          kind: 'monthly_workforce_report',
          entityId: '2026-08',
          reportMonth: '2026-08',
          idempotencyKey: `test-${provider}-${Date.now()}`,
        });

        expect(result.status).toBe('saved');
        if (result.status !== 'saved') return;

        const document = await findDocumentById(context.db, context.organizationId, result.documentId);
        expect(document?.status).toBe('available');
        expect(document?.storageBackend).toBe('external');
        expect(document?.externalFileId).toBeTruthy();
        expect(document?.category).toBe('generated_pdf');

        const storageFile = await findStorageFileByDocumentId(
          context.db,
          context.organizationId,
          result.documentId,
        );
        expect(storageFile?.externalFileId).toBe(result.externalFileId);
        expect(storageFile?.mimeType).toBe('application/pdf');

        const versions = await listVersions(context, { documentId: result.documentId });
        expect(versions.length).toBeGreaterThan(0);
        expect(versions[0]?.isCurrent).toBe(true);

        const download = await getExternalDocumentDownload(context, result.documentId);
        expect('url' in download && download.url).toContain('storage.test/download');
        expect(download.filename).toContain('.pdf');
        expect(document?.sizeBytes).toBeGreaterThan(500);
      });
    });
  }

  it('marks monthly notification handled after successful save', async () => {
    const org = await provisionTenant(database, 'owner-notify@example.test', 'onedrive');

    await database.asUser(org.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: org.owner.id,
        organizationId: org.organizationId,
        locale: 'he-IL',
      });

      await saveGeneratedReportToStorage(context, {
        kind: 'monthly_workforce_report',
        entityId: '2026-08',
        reportMonth: '2026-08',
        idempotencyKey: `notify-${Date.now()}`,
      });

      const states = await listCommandCenterItemStates(context.db, context.organizationId);
      const handled = states.find(
        (state) =>
          state.sourceType === 'monthly_workforce_report_ready' &&
          state.sourceId === '2026-08' &&
          state.state === 'handled',
      );
      expect(handled).toBeTruthy();
    });
  });
});

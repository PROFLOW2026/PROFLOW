/**
 * FIN-002 — billing void coordinates statutory cancel (EXEC, no live SUMIT).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBillingRecord, voidBillingRecord } from '@/modules/billing';
import { createClient } from '@/modules/clients';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  drizzleExternalDocumentsRepository,
  resetExternalDocumentsStoreForTests,
  ScriptedStatutoryProvider,
  setInvoicingIntegrationPersistenceReadyForTests,
  setStatutoryInvoicingProviderForTests,
} from '@/modules/invoicing-integration';
import { listExternalDocuments } from '@/modules/invoicing-integration/data/external-documents';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';
import {
  enableExternalProviderSettingsForTests,
  resetOrgInvoicingSettingsForTests,
} from '@tests/unit/invoicing-integration/test-external-provider-settings';

describe('audit FIN-002 void and statutory cancel (EXEC)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    resetOrgInvoicingSettingsForTests();
    setStatutoryInvoicingProviderForTests(null);
    setInvoicingIntegrationPersistenceReadyForTests(null);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    resetExternalDocumentsStoreForTests();
    setInvoicingIntegrationPersistenceReadyForTests(true);
    resetOrgInvoicingSettingsForTests();
    setStatutoryInvoicingProviderForTests(null);
  });

  afterEach(() => {
    resetOrgInvoicingSettingsForTests();
    setStatutoryInvoicingProviderForTests(null);
  });

  it('voidBillingRecord marks AR void without statutory docs when none exist', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'fin-void@example.test');
    const tenant = await createTestOrganization(database, owner, 'Fin Void Org');

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: tenant.organization.id,
        locale: 'he-IL',
      });
      const client = await createClient(context, { name: 'Client' });
      const project = await createProject(context, { name: 'Job', clientId: client.id });
      const billed = await createBillingRecord(context, {
        projectId: project.projectId,
        amount: '1000',
        issueDate: '2026-08-01',
        vatMode: 'exclusive',
        finalize: true,
      });

      const beforeDocs = await listExternalDocuments(context, billed.id);
      expect(beforeDocs).toHaveLength(0);

      const voided = await voidBillingRecord(context, billed.id);
      expect(voided.status).toBe('void');

      const afterDocs = await listExternalDocuments(context, billed.id);
      expect(afterDocs).toHaveLength(0);
    });
  });

  it('voidBillingRecord cancels issued statutory tax invoice via scripted provider (mock chain)', async () => {
    await seedSystem(database);
    enableExternalProviderSettingsForTests();
    const provider = new ScriptedStatutoryProvider();
    setStatutoryInvoicingProviderForTests(provider);

    const owner = await createTestUser(database, 'fin-void-cancel@example.test');
    const tenant = await createTestOrganization(database, owner, 'Fin Void Cancel Org');

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: tenant.organization.id,
        locale: 'he-IL',
      });
      const client = await createClient(context, { name: 'Client' });
      const project = await createProject(context, { name: 'Job', clientId: client.id });
      const billed = await createBillingRecord(context, {
        projectId: project.projectId,
        amount: '1000',
        issueDate: '2026-08-01',
        vatMode: 'exclusive',
        finalize: true,
      });

      const externalId = '01900000-0000-7000-8000-0000000000e1';
      provider.registerExternalDocumentForTests({
        externalId,
        billingRecordId: billed.id,
      });
      await drizzleExternalDocumentsRepository.create(tx, {
        organizationId: tenant.organization.id,
        billingRecordId: billed.id,
        providerId: 'scripted-test',
        kind: 'tax_invoice',
        status: 'issued',
        externalId,
        externalNumber: 'EXT-VOID-1',
        issuanceOutcome: 'confirmed_created',
      });

      const beforeDocs = await listExternalDocuments(context, billed.id);
      expect(beforeDocs).toHaveLength(1);
      expect(beforeDocs[0]?.status).toBe('issued');

      const voided = await voidBillingRecord(context, billed.id);
      expect(voided.status).toBe('void');

      const afterDocs = await listExternalDocuments(context, billed.id);
      expect(afterDocs).toHaveLength(1);
      expect(afterDocs[0]?.status).toBe('cancelled');
    });
  });
});

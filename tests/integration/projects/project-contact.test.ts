import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createClient,
  createClientContact,
  listContactsForClient,
  markClientContactAsPrimary,
} from '@/modules/clients';
import {
  createProject,
  getProjectDetail,
  updateProject,
} from '@/modules/projects';
import { ValidationError } from '@/shared/errors';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('project primary contact', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('rejects a contact that belongs to a different client', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });

        const clientA = await createClient(context, { name: 'Client A' });
        const clientB = await createClient(context, { name: 'Client B' });
        const foreignContact = await createClientContact(context, {
          clientId: clientB.id,
          name: 'Other Client Contact',
          phone: '050-0000001',
          role: 'other',
        });

        await createProject(context, {
          name: 'Mismatch Project',
          clientId: clientA.id,
          primaryContactId: foreignContact.id,
        });
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('allows the same client to have different contacts on different projects', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const result = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const client = await createClient(context, { name: 'Shared Client' });
      const contactA = await createClientContact(context, {
        clientId: client.id,
        name: 'Contact A',
        phone: '050-1111111',
        role: 'primary',
      });
      const contactB = await createClientContact(context, {
        clientId: client.id,
        name: 'Contact B',
        phone: '050-2222222',
        role: 'other',
      });

      const projectA = await createProject(context, {
        name: 'Project A',
        clientId: client.id,
        primaryContactId: contactA.id,
      });
      const projectB = await createProject(context, {
        name: 'Project B',
        clientId: client.id,
        primaryContactId: contactB.id,
      });

      const detailA = await getProjectDetail(context, projectA.projectId);
      const detailB = await getProjectDetail(context, projectB.projectId);

      return { detailA, detailB, contactA, contactB };
    });

    expect(result.detailA.project.primaryContactId).toBe(result.contactA.id);
    expect(result.detailB.project.primaryContactId).toBe(result.contactB.id);
    expect(result.detailA.clientContact?.id).toBe(result.contactA.id);
    expect(result.detailB.clientContact?.id).toBe(result.contactB.id);
    expect(result.detailA.clientContact?.isProjectSpecific).toBe(true);
    expect(result.detailB.clientContact?.isProjectSpecific).toBe(true);
  });

  it('does not flip client-wide primary when changing project contact', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const result = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const client = await createClient(context, { name: 'Stable Primary Co' });
      const primary = await createClientContact(context, {
        clientId: client.id,
        name: 'Client Primary',
        phone: '050-3333333',
        role: 'primary',
      });
      await markClientContactAsPrimary(context, { contactId: primary.id });

      const site = await createClientContact(context, {
        clientId: client.id,
        name: 'Site Contact',
        phone: '050-4444444',
        role: 'other',
      });

      const { projectId } = await createProject(context, {
        name: 'Contact Switch Project',
        clientId: client.id,
        primaryContactId: primary.id,
      });

      await updateProject(context, {
        projectId,
        primaryContactId: site.id,
      });

      const detail = await getProjectDetail(context, projectId);
      const contacts = await listContactsForClient(context, client.id);
      const stillPrimary = contacts.find((row) => row.role === 'primary');

      return { detail, stillPrimary, primary, site };
    });

    expect(result.detail.project.primaryContactId).toBe(result.site.id);
    expect(result.detail.clientContact?.id).toBe(result.site.id);
    expect(result.stillPrimary?.id).toBe(result.primary.id);
    expect(result.stillPrimary?.role).toBe('primary');
  });

  it('falls back to client practical primary when project contact is unset', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const result = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const client = await createClient(context, { name: 'Fallback Client' });
      const primary = await createClientContact(context, {
        clientId: client.id,
        name: 'Fallback Primary',
        phone: '050-5555555',
        role: 'primary',
      });

      const { projectId } = await createProject(context, {
        name: 'No Project Contact',
        clientId: client.id,
      });

      const detail = await getProjectDetail(context, projectId);
      return { detail, primary };
    });

    expect(result.detail.project.primaryContactId).toBeNull();
    expect(result.detail.clientContact?.id).toBe(result.primary.id);
    expect(result.detail.clientContact?.isProjectSpecific).toBe(false);
  });
});

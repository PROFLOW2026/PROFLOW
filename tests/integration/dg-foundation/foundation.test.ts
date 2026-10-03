import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  domainEvents,
  entityLinks,
  projectLocations,
  projects,
  subcontractWorkLinePrices,
  subcontractWorkLines,
} from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import { emitDomainEvent, DOMAIN_EVENTS } from '@/shared/domain-events';
import { externalActor, internalActor } from '@/shared/actor';
import { EXTERNAL_CAPABILITIES as X } from '@/shared/external';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  orgContextFor,
} from '@tests/setup/dg-fixtures';
import { provisionTwoTenants } from '../projects/setup';

describe('Developer/GC foundation (migration 0155)', () => {
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

  async function scenario() {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
    const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Other');
    const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
    const pmOps = await addOrgMember(database, orgId, 'pm-ops');
    const accountant = await addOrgMember(database, orgId, 'acct');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: pmOps.id, templateKey: 'project_manager_operational' });
      await addProjectMember(context, { projectId, userId: accountant.id, templateKey: 'project_accountant' });
    });

    // One work line + price per contractor (service role = trusted seed).
    const lines = await database.asService(async (db) => {
      const result: Record<'A' | 'B', string> = { A: '', B: '' };
      for (const [key, contractor] of [['A', contractorA], ['B', contractorB]] as const) {
        const [line] = await db
          .insert(subcontractWorkLines)
          .values({
            organizationId: orgId,
            agreementId: contractor.agreementId!,
            projectId,
            vendorId: contractor.vendorId,
            code: `L-${key}`,
            description: `Work ${key}`,
            quantity: '10',
          })
          .returning({ id: subcontractWorkLines.id });
        await db.insert(subcontractWorkLinePrices).values({
          workLineId: line!.id,
          organizationId: orgId,
          currency: 'ILS',
          unitPrice: '5',
          contractAmount: '50',
        });
        result[key] = line!.id;
      }
      return result;
    });
    return { orgId, userA, projectId, otherProjectId, contractorA, contractorB, pmOps, accountant, lines };
  }

  it('isolates contractor A from contractor B (work lines and prices)', async () => {
    const { contractorA, lines } = await scenario();
    await database.asUser(contractorA.authUser.id, async (tx) => {
      const rows = await tx.select({ id: subcontractWorkLines.id }).from(subcontractWorkLines);
      expect(rows.map((r) => r.id)).toEqual([lines.A]);
      const prices = await tx.select().from(subcontractWorkLinePrices);
      expect(prices.map((r) => r.workLineId)).toEqual([lines.A]);
    });
  });

  it('hides prices from a contractor without ext.contract.view_value but shows operational lines', async () => {
    const { orgId, projectId } = await scenario();
    const limited = await createContractor(database, {
      organizationId: orgId,
      projectId,
      label: 'limited',
      capabilities: [X.PROJECT_VIEW],
    });
    await database.asService((db) =>
      db.insert(subcontractWorkLines).values({
        organizationId: orgId,
        agreementId: limited.agreementId!,
        projectId,
        vendorId: limited.vendorId,
        description: 'Limited work',
      }),
    );
    await database.asUser(limited.authUser.id, async (tx) => {
      expect(await tx.select().from(subcontractWorkLines)).toHaveLength(1);
      expect(await tx.select().from(subcontractWorkLinePrices)).toHaveLength(0);
    });
  });

  it('narrowing a grant to an agreement hides the vendor other agreements', async () => {
    const { orgId, projectId } = await scenario();
    const narrow = await createContractor(database, {
      organizationId: orgId,
      projectId,
      label: 'narrow',
      narrowToAgreement: true,
    });
    // second agreement of the same vendor
    const second = await createContractor(database, {
      organizationId: orgId,
      projectId,
      label: 'narrow-2',
      vendorId: narrow.vendorId,
    });
    await database.asService(async (db) => {
      for (const agreementId of [narrow.agreementId!, second.agreementId!]) {
        await db.insert(subcontractWorkLines).values({
          organizationId: orgId,
          agreementId,
          projectId,
          vendorId: narrow.vendorId,
          description: `Line ${agreementId.slice(0, 4)}`,
        });
      }
    });
    await database.asUser(narrow.authUser.id, async (tx) => {
      const rows = await tx.select().from(subcontractWorkLines);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.agreementId).toBe(narrow.agreementId);
    });
  });

  it('separates money from operations for internal members', async () => {
    const { pmOps, accountant, lines } = await scenario();
    await database.asUser(pmOps.id, async (tx) => {
      expect((await tx.select().from(subcontractWorkLines)).length).toBe(2);
      expect(await tx.select().from(subcontractWorkLinePrices)).toHaveLength(0);
    });
    await database.asUser(accountant.id, async (tx) => {
      const prices = await tx.select().from(subcontractWorkLinePrices);
      expect(prices.map((p) => p.workLineId).sort()).toEqual([lines.A, lines.B].sort());
    });
  });

  it('keeps external principals out of org-scoped tables', async () => {
    const { contractorA, orgId } = await scenario();
    await database.asUser(contractorA.authUser.id, async (tx) => {
      expect(await tx.select({ id: projects.id }).from(projects)).toHaveLength(0);
      expect(await tx.select().from(entityLinks)).toHaveLength(0);
      expect(await tx.select().from(domainEvents)).toHaveLength(0);
      const member = await tx.execute(sql`select app.is_org_member(${orgId}::uuid) as m`);
      expect((member as unknown as { rows: { m: boolean }[] }).rows[0]!.m).toBe(false);
    });
  });

  it('lets a contractor read locations only of projects it works on', async () => {
    const { userA, orgId, projectId, otherProjectId, contractorA } = await scenario();
    await database.asUser(userA.id, async (tx) => {
      await tx.insert(projectLocations).values([
        { organizationId: orgId, projectId, name: 'Floor 1', type: 'floor', code: 'F1' },
        { organizationId: orgId, projectId: otherProjectId, name: 'Hidden floor', type: 'floor', code: 'F1' },
      ]);
    });
    await database.asUser(contractorA.authUser.id, async (tx) => {
      const rows = await tx.select({ name: projectLocations.name }).from(projectLocations);
      expect(rows.map((r) => r.name)).toEqual(['Floor 1']);
      await expect(
        tx.insert(projectLocations).values({ organizationId: orgId, projectId, name: 'Hack', type: 'room' }),
      ).rejects.toBeDefined();
    });
  });

  it('prevents location cycles and cross-project parents', async () => {
    const { userA, orgId, projectId, otherProjectId } = await scenario();
    await database.asUser(userA.id, async (tx) => {
      const [root] = await tx
        .insert(projectLocations)
        .values({ organizationId: orgId, projectId, name: 'Building', type: 'building' })
        .returning({ id: projectLocations.id });
      const [child] = await tx
        .insert(projectLocations)
        .values({ organizationId: orgId, projectId, name: 'Floor', type: 'floor', parentId: root!.id })
        .returning({ id: projectLocations.id });
      await expect(
        tx.update(projectLocations).set({ parentId: child!.id }).where(eq(projectLocations.id, root!.id)),
      ).rejects.toBeDefined();
    });
    await database.asService(async (db) => {
      const [root] = await db
        .insert(projectLocations)
        .values({ organizationId: orgId, projectId, name: 'Root2', type: 'building' })
        .returning({ id: projectLocations.id });
      await expect(
        db.insert(projectLocations).values({
          organizationId: orgId,
          projectId: otherProjectId,
          name: 'Cross',
          type: 'floor',
          parentId: root!.id,
        }),
      ).rejects.toBeDefined();
    });
  });

  it('records domain events immutably with a consistent actor', async () => {
    const { userA, orgId, projectId, contractorA } = await scenario();
    const registry = DOMAIN_EVENTS as Record<string, string>;
    expect(typeof registry).toBe('object');
    const type = 'foundation.test.happened' as never;

    await database.asUser(userA.id, async (tx) => {
      await emitDomainEvent(tx, {
        organizationId: orgId,
        projectId,
        type,
        entityType: 'foundation_test',
        entityId: projectId,
        actor: internalActor(userA.id),
      });
    });
    // external principal can append only as itself
    await database.asUser(contractorA.authUser.id, async (tx) => {
      await emitDomainEvent(tx, {
        organizationId: orgId,
        projectId,
        type,
        entityType: 'foundation_test',
        entityId: projectId,
        actor: externalActor(contractorA.principalId),
      });
    });
    await database.asUser(contractorA.authUser.id, async (tx) => {
      await expect(
        emitDomainEvent(tx, {
          organizationId: orgId,
          projectId,
          type,
          entityType: 'foundation_test',
          entityId: projectId,
          actor: externalActor('00000000-0000-4000-8000-000000000999'),
        }),
      ).rejects.toBeDefined();
    });
    await database.asService(async (db) => {
      const rows = await db.select().from(domainEvents);
      expect(rows).toHaveLength(2);
      await expect(
        db.update(domainEvents).set({ payload: { tampered: true } }).where(eq(domainEvents.id, rows[0]!.id)),
      ).rejects.toBeDefined();
      await db.update(domainEvents).set({ processedAt: new Date() }).where(eq(domainEvents.id, rows[0]!.id));
      await expect(db.delete(domainEvents).where(eq(domainEvents.id, rows[0]!.id))).rejects.toBeDefined();
    });
  });
});

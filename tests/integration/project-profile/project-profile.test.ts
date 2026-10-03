import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  apBills,
  auditEvents,
  committedCosts,
  contracts,
  domainEvents,
  projectBudgets,
  projectConstructionCharacteristics,
  projectDeliveryProfiles,
  projectLocations,
  projectMilestones,
  projectRecommendationDecisions,
  projects,
  purchaseOrders,
  subcontractAgreements,
  tasks,
  workPackages,
} from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import {
  acceptRecommendations,
  applyDeliveryAtProjectCreate,
  archiveProjectLocation,
  createProjectLocation,
  dismissRecommendations,
  generateProjectLocations,
  getProjectStructure,
  listLocationOptions,
  listProjectRecommendations,
  moveProjectLocation,
  parseDeliveryCreateFormData,
  resolveLocationLabels,
  restoreProjectLocation,
  restoreRecommendations,
  updateConstructionCharacteristics,
  updateDeliveryProfile,
  updateProjectLocationDetails,
  type LocationGeneratorLabels,
} from '@/modules/project-profile';
import { createProject } from '@/modules/projects';
import { AuthorizationError, ConflictError, DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { addOrgMember, createContractor, createProjectAs, orgContextFor } from '@tests/setup/dg-fixtures';
import { provisionTwoTenants } from '../projects/setup';

const LABELS: LocationGeneratorLabels = {
  building: 'Building {n}',
  floor: 'Floor {n}',
  groundFloor: 'Ground floor',
  basement: 'Basement {n}',
  parking: 'Parking {n}',
  roof: 'Roof',
  apartment: 'Apt {n}',
  unit: 'Unit {n}',
};

const SPEC_3x8x4 = {
  buildings: 3,
  buildingCodeStyle: 'letters' as const,
  floorsAboveGround: 8,
  floorsBelowGround: 0,
  includeGroundFloor: false,
  unitsPerFloor: 4,
  unitType: 'apartment' as const,
  unitsOnGroundFloor: false,
  unitNumbering: 'per_building' as const,
  undergroundAsParking: false,
  includeRoof: false,
};

const TOWER_CHARACTERISTICS = {
  category: 'residential',
  constructionMethod: 'cast_in_place',
  buildingsCount: 2,
  floorsAboveGround: 10,
  floorsBelowGround: 2,
  residentialUnits: 80,
  commercialUnits: null,
  parkingLevels: 2,
  hasPublicAreas: true,
  builtAreaSqm: '12000',
  commercialAreaSqm: null,
  commonAreaSqm: '900.5',
  siteAreaSqm: '3500',
  customMetadata: [{ key: 'Lot', value: '6123/45' }],
};

const title = (item: { kind: string; code: string; params: Readonly<Record<string, number>> }) =>
  `${item.kind}:${item.code}${item.params.n ? ` ${item.params.n}` : ''}`;

describe('project delivery profile / characteristics / locations / recommendations (0157)', () => {
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
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
    const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Other');
    const pmOps = await addOrgMember(database, orgId, 'pm-ops');
    const viewer = await addOrgMember(database, orgId, 'viewer');
    const outsider = await addOrgMember(database, orgId, 'outsider');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: pmOps.id, templateKey: 'project_manager_operational' });
      await addProjectMember(context, { projectId, userId: viewer.id, templateKey: 'viewer' });
    });
    return { orgId, orgB: orgB.organization.id, userA, userB, projectId, otherProjectId, pmOps, viewer, outsider };
  }

  function as<T>(userId: string, orgId: string, fn: (context: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) {
    return database.asUser(userId, async (tx) => fn(await orgContextFor(tx, userId, orgId)));
  }

  it('stores an optional developer profile with no client and keeps standard projects untouched', async () => {
    const { orgId, userA, projectId, otherProjectId } = await scenario();
    await as(userA.id, orgId, async (context) => {
      const before = await getProjectStructure(context, otherProjectId);
      expect(before.profileSaved).toBe(false);
      expect(before.profile.operatingRoles).toEqual([]);
      expect(before.recommendations.items).toEqual([]);

      const profile = await updateDeliveryProfile(context, {
        projectId,
        operatingRoles: ['general_contractor', 'developer'],
        developerEntityName: 'Tower SPV Ltd',
      });
      expect(profile).toMatchObject({
        operatingRoles: ['developer', 'general_contractor'],
        ownershipModel: 'own_development',
        developerEntityName: 'Tower SPV Ltd',
      });
      const view = await getProjectStructure(context, projectId);
      expect(view.project.hasClient).toBe(false);
      expect(view.clientRequirement).toBe('not_applicable');
      expect(view.profileSaved).toBe(true);
    });

    await database.asService(async (db) => {
      const [project] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId));
      expect(project!.clientId).toBeNull();
      const events = await db.select().from(domainEvents).where(eq(domainEvents.eventType, 'profile.delivery_profile.updated'));
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toMatchObject({ clientRequirement: 'not_applicable' });
      const audits = await db.select().from(auditEvents).where(eq(auditEvents.action, 'project_delivery_profile.updated'));
      expect(audits).toHaveLength(1);
      // DB check: own_development without the developer role is impossible.
      await expect(
        db.update(projectDeliveryProfiles).set({ operatingRoles: ['general_contractor'] }).where(eq(projectDeliveryProfiles.projectId, projectId)),
      ).rejects.toBeDefined();
    });
  });

  it('authorizes by project capability (settings vs manage vs view) and isolates tenants', async () => {
    const { orgId, orgB, userA, userB, projectId, pmOps, viewer, outsider } = await scenario();

    // Operational PM: may edit characteristics, may NOT change the delivery profile (administrative).
    await as(pmOps.id, orgId, async (context) => {
      await expect(updateDeliveryProfile(context, { projectId, operatingRoles: ['developer'] })).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      await updateConstructionCharacteristics(context, { projectId, ...TOWER_CHARACTERISTICS });
    });

    // Viewer reads, cannot write (use-case + RLS).
    await as(viewer.id, orgId, async (context) => {
      const view = await getProjectStructure(context, projectId);
      expect(view.characteristics.floorsAboveGround).toBe(10);
      expect(view.characteristics.customMetadata).toEqual({ Lot: '6123/45' });
      expect(view.permissions).toMatchObject({ canView: true, canManageStructure: false, canManageSettings: false });
      await expect(
        updateConstructionCharacteristics(context, { projectId, ...TOWER_CHARACTERISTICS, floorsAboveGround: 1 }),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await expect(
        createProjectLocation(context, { projectId, parentId: null, type: 'building', name: 'X', code: null }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
    await database.asUser(viewer.id, async (tx) => {
      await expect(
        tx.insert(projectDeliveryProfiles).values({ organizationId: orgId, projectId, operatingRoles: ['developer'] }),
      ).rejects.toBeDefined();
    });
    await database.asUser(viewer.id, async (tx) => {
      const rows = await tx
        .update(projectConstructionCharacteristics)
        .set({ floorsAboveGround: 1 })
        .where(eq(projectConstructionCharacteristics.projectId, projectId))
        .returning({ id: projectConstructionCharacteristics.id });
      expect(rows).toHaveLength(0);
    });

    // Org member without project membership: no capability -> no rows, use-case denies.
    await database.asUser(outsider.id, async (tx) => {
      expect(await tx.select().from(projectConstructionCharacteristics)).toHaveLength(0);
      const context = await orgContextFor(tx, outsider.id, orgId);
      await expect(getProjectStructure(context, projectId)).rejects.toBeInstanceOf(AuthorizationError);
    });

    // Other tenant sees nothing.
    await database.asUser(userB.id, async (tx) => {
      expect(await tx.select().from(projectConstructionCharacteristics)).toHaveLength(0);
      const context = await orgContextFor(tx, userB.id, orgB);
      await expect(getProjectStructure(context, projectId)).rejects.toBeDefined();
    });

    // Owner (project_team.admin) can do everything.
    await as(userA.id, orgId, async (context) => {
      await updateDeliveryProfile(context, { projectId, operatingRoles: ['developer'] });
    });
  });

  it('keeps external contractors out of profile tables', async () => {
    const { orgId, userA, projectId } = await scenario();
    const contractor = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    await as(userA.id, orgId, async (context) => {
      await updateDeliveryProfile(context, { projectId, operatingRoles: ['general_contractor'] });
      await updateConstructionCharacteristics(context, { projectId, ...TOWER_CHARACTERISTICS });
      await createProjectLocation(context, { projectId, parentId: null, type: 'building', name: 'Building A', code: 'A' });
    });
    await database.asUser(contractor.authUser.id, async (tx) => {
      expect(await tx.select().from(projectDeliveryProfiles)).toHaveLength(0);
      expect(await tx.select().from(projectConstructionCharacteristics)).toHaveLength(0);
      expect(await tx.select().from(projectRecommendationDecisions)).toHaveLength(0);
      // ...but can read the project locations it works on (foundation policy).
      expect((await tx.select().from(projectLocations)).map((row) => row.name)).toEqual(['Building A']);
    });
  });

  it('manages the location tree (create, codes, move, archive subtree, restore, labels)', async () => {
    const { orgId, pmOps, projectId, otherProjectId, userA } = await scenario();
    const ids = await as(pmOps.id, orgId, async (context) => {
      const building = await createProjectLocation(context, { projectId, parentId: null, type: 'building', name: 'Building A', code: 'A' });
      const buildingB = await createProjectLocation(context, { projectId, parentId: null, type: 'building', name: 'Building B', code: 'B' });
      const floor = await createProjectLocation(context, { projectId, parentId: building.id, type: 'floor', name: 'Floor 1', code: 'F01' });
      const apt = await createProjectLocation(context, { projectId, parentId: floor.id, type: 'apartment', name: 'Apt 1', code: '1' });

      await expect(
        createProjectLocation(context, { projectId, parentId: null, type: 'building', name: 'Dup', code: 'a' }),
      ).rejects.toBeInstanceOf(ConflictError);
      // Same code under a different parent is fine.
      await createProjectLocation(context, { projectId, parentId: buildingB.id, type: 'floor', name: 'Floor 1', code: 'F01' });

      await expect(moveProjectLocation(context, { projectId, locationId: building.id, parentId: apt.id })).rejects.toBeInstanceOf(
        DomainRuleError,
      );
      await updateProjectLocationDetails(context, { projectId, locationId: apt.id, name: 'Apartment 1' });

      const labels = await resolveLocationLabels(context, [apt.id, null, floor.id]);
      expect(labels.get(apt.id)).toBe('Building A › Floor 1 › Apartment 1');

      const { archivedCount } = await archiveProjectLocation(context, { projectId, locationId: building.id });
      expect(archivedCount).toBe(3);
      expect((await listLocationOptions(context, projectId)).map((n) => n.name).sort()).toEqual(['Building B', 'Floor 1']);
      await expect(restoreProjectLocation(context, { projectId, locationId: floor.id })).rejects.toBeInstanceOf(DomainRuleError);
      await restoreProjectLocation(context, { projectId, locationId: building.id });
      await restoreProjectLocation(context, { projectId, locationId: floor.id });
      return { building: building.id, floor: floor.id };
    });

    // Cross-project parent is rejected.
    await as(userA.id, orgId, async (context) => {
      await expect(
        createProjectLocation(context, { projectId: otherProjectId, parentId: ids.floor, type: 'room', name: 'Cross', code: null }),
      ).rejects.toBeDefined();
    });

    await database.asService(async (db) => {
      const events = await db.select({ type: domainEvents.eventType }).from(domainEvents).where(eq(domainEvents.projectId, projectId));
      expect(events.map((e) => e.type)).toEqual(
        expect.arrayContaining(['profile.location.created', 'profile.location.archived', 'profile.location.restored']),
      );
    });
  });

  it('bulk-generates "3 buildings x 8 floors x 4 apartments" atomically', async () => {
    const { orgId, userA, projectId } = await scenario();
    await as(userA.id, orgId, async (context) => {
      const site = await createProjectLocation(context, { projectId, parentId: null, type: 'site', name: 'Site', code: 'S' });
      const result = await generateProjectLocations(context, { projectId, parentId: site.id, spec: SPEC_3x8x4 }, LABELS);
      expect(result.createdCount).toBe(3 * (1 + 8 + 32));
      expect(result.rootIds).toHaveLength(3);

      const options = await listLocationOptions(context, projectId);
      expect(options).toHaveLength(1 + 123);
      const apt = options.find((n) => n.type === 'apartment' && n.name === 'Apt 32')!;
      const labels = await resolveLocationLabels(context, [apt.id]);
      expect(labels.get(apt.id)).toMatch(/^Site › Building [ABC] › Floor 8 › Apt 32$/);

      // Second run under the same parent collides on building codes -> nothing inserted.
      await expect(
        generateProjectLocations(context, { projectId, parentId: site.id, spec: SPEC_3x8x4 }, LABELS),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await listLocationOptions(context, projectId)).toHaveLength(124);

      await expect(
        generateProjectLocations(context, { projectId, parentId: null, spec: { ...SPEC_3x8x4, floorsAboveGround: 0 } }, LABELS),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('accepts recommendations into work packages / milestones / tasks only - never financial records', async () => {
    const { orgId, userA, pmOps, projectId } = await scenario();
    const financialCounts = () =>
      database.asService(async (db) => ({
        contracts: (await db.select().from(contracts).where(eq(contracts.projectId, projectId))).length,
        subcontracts: (await db.select().from(subcontractAgreements).where(eq(subcontractAgreements.projectId, projectId))).length,
        commitments: (await db.select().from(committedCosts).where(eq(committedCosts.projectId, projectId))).length,
        purchaseOrders: (await db.select().from(purchaseOrders).where(eq(purchaseOrders.projectId, projectId))).length,
        apBills: (await db.select().from(apBills).where(eq(apBills.organizationId, orgId))).length,
        budgets: (await db.select().from(projectBudgets).where(eq(projectBudgets.projectId, projectId))).length,
      }));
    const before = await financialCounts();

    const state = await as(userA.id, orgId, async (context) => {
      await updateDeliveryProfile(context, { projectId, operatingRoles: ['developer', 'general_contractor'] });
      await updateConstructionCharacteristics(context, { projectId, ...TOWER_CHARACTERISTICS });
      return listProjectRecommendations(context, projectId);
    });
    const keys = state.items.map((item) => item.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'trade:elevators',
        'work_package:building:1',
        'work_package:building:2',
        'milestone:buyers_handover',
        'inspection:rebar_pre_pour',
        'task_template:appoint_safety_officer',
      ]),
    );
    expect(state.items.every((item) => item.status === 'open')).toBe(true);

    const accepted = await as(userA.id, orgId, (context) =>
      acceptRecommendations(
        context,
        { projectId, keys: ['trade:elevators', 'milestone:buyers_handover', 'inspection:rebar_pre_pour', 'not:recommended'] },
        title,
      ),
    );
    expect(accepted.accepted.map((a) => [a.key, a.createdEntityType])).toEqual([
      ['trade:elevators', 'work_package'],
      ['milestone:buyers_handover', 'project_milestone'],
      ['inspection:rebar_pre_pour', 'task'],
    ]);

    await database.asService(async (db) => {
      const packages = await db.select().from(workPackages).where(eq(workPackages.projectId, projectId));
      expect(packages.map((p) => p.name)).toContain('trade:elevators');
      const milestones = await db.select().from(projectMilestones).where(eq(projectMilestones.projectId, projectId));
      expect(milestones.map((m) => [m.name, m.status])).toEqual([['milestone:buyers_handover', 'planned']]);
      const projectTasks = await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.title, 'inspection:rebar_pre_pour')));
      expect(projectTasks).toHaveLength(1);
      const decisions = await db.select().from(projectRecommendationDecisions);
      expect(decisions).toHaveLength(3);
      expect(decisions.every((d) => d.decision === 'accepted' && d.createdEntityId)).toBe(true);
      // Accepted decisions are permanent facts.
      await expect(db.delete(projectRecommendationDecisions).where(eq(projectRecommendationDecisions.id, decisions[0]!.id))).rejects.toBeDefined();
      await expect(
        db.update(projectRecommendationDecisions).set({ rulesetVersion: 'x' }).where(eq(projectRecommendationDecisions.id, decisions[0]!.id)),
      ).rejects.toBeDefined();
      const events = await db.select().from(domainEvents).where(eq(domainEvents.eventType, 'profile.recommendation.accepted'));
      expect(events).toHaveLength(3);
      for (const event of events) expect(Object.keys(event.payload).sort()).toEqual(['createdEntityId', 'createdEntityType', 'kind', 'recommendationKey']);
    });
    expect(await financialCounts()).toEqual(before);

    // Re-accepting an accepted key does nothing.
    await as(userA.id, orgId, async (context) => {
      await expect(acceptRecommendations(context, { projectId, keys: ['trade:elevators'] }, title)).rejects.toBeInstanceOf(
        DomainRuleError,
      );
    });

    // Operational PM can accept a work package (project.manage) and dismiss/restore.
    await as(pmOps.id, orgId, async (context) => {
      await acceptRecommendations(context, { projectId, keys: ['work_package:building:1'] }, title);
      await dismissRecommendations(context, { projectId, keys: ['trade:gas', 'trade:elevators'] });
      let current = await listProjectRecommendations(context, projectId);
      expect(current.items.find((i) => i.key === 'trade:gas')!.status).toBe('dismissed');
      expect(current.items.find((i) => i.key === 'trade:elevators')!.status).toBe('accepted');
      await restoreRecommendations(context, { projectId, keys: ['trade:gas', 'trade:elevators'] });
      current = await listProjectRecommendations(context, projectId);
      expect(current.items.find((i) => i.key === 'trade:gas')!.status).toBe('open');
      expect(current.items.find((i) => i.key === 'trade:elevators')!.status).toBe('accepted');
    });
    expect(await financialCounts()).toEqual(before);
  });

  it('viewer cannot accept or dismiss recommendations', async () => {
    const { orgId, userA, viewer, projectId } = await scenario();
    await as(userA.id, orgId, (context) => updateConstructionCharacteristics(context, { projectId, ...TOWER_CHARACTERISTICS }));
    await as(viewer.id, orgId, async (context) => {
      expect((await listProjectRecommendations(context, projectId)).items.length).toBeGreaterThan(0);
      await expect(acceptRecommendations(context, { projectId, keys: ['trade:elevators'] }, title)).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      await expect(dismissRecommendations(context, { projectId, keys: ['trade:elevators'] })).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
    await database.asUser(viewer.id, async (tx) => {
      await expect(
        tx.insert(projectRecommendationDecisions).values({
          organizationId: orgId,
          projectId,
          recommendationKey: 'trade:elevators',
          kind: 'trade',
          decision: 'dismissed',
          rulesetVersion: 'x',
          decidedUserId: viewer.id,
        }),
      ).rejects.toBeDefined();
    });
  });

  it('applies the optional create-form section in the same transaction as createProject', async () => {
    const { orgId, userA } = await scenario();
    const form = new FormData();
    form.append('deliveryProfile.roles', 'developer');
    form.set('deliveryProfile.category', 'residential');
    form.set('deliveryProfile.floorsAboveGround', '6');
    const created = await as(userA.id, orgId, async (context) => {
      const project = await createProject(context, { name: 'Self development' });
      await applyDeliveryAtProjectCreate(context, project.projectId, parseDeliveryCreateFormData(form));
      return getProjectStructure(context, project.projectId);
    });
    expect(created.project.hasClient).toBe(false);
    expect(created.profile.operatingRoles).toEqual(['developer']);
    expect(created.clientRequirement).toBe('not_applicable');
    expect(created.characteristics).toMatchObject({ category: 'residential', floorsAboveGround: 6 });
    expect(created.recommendations.items.some((i) => i.key === 'milestone:building_permit')).toBe(true);

    const empty = await as(userA.id, orgId, async (context) => {
      const project = await createProject(context, { name: 'Plain' });
      return applyDeliveryAtProjectCreate(context, project.projectId, parseDeliveryCreateFormData(new FormData()));
    });
    expect(empty.applied).toBe(false);
  });
});

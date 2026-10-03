import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  domainEvents,
  subcontractAgreementFinancialTerms,
  subcontractChangeVersions,
  subcontractChanges,
  subcontractValueEvents,
  subcontractWorkLineAdjustments,
  subcontractWorkLinePrices,
} from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import {
  addWorkLine,
  approveChange,
  changeAgreementStatus,
  convertUnpricedWorkToChange,
  counterContractorChange,
  createChange,
  createChangeFromInstruction,
  createDraftAgreement,
  getAgreementWorkspace,
  getContractorAgreement,
  getProjectUnpricedWork,
  listAgreementChanges,
  listContractorChanges,
  listRevisedWorkLines,
  loadAgreementValuePosition,
  proposeChangeVersion,
  recordUnpricedWork,
  rejectChange,
  submitChange,
  submitContractorChangeProposal,
  updateWorkLine,
} from '@/modules/subcontracts';
import { resolveEntityScope } from '@/shared/entity-access';
import { EXTERNAL_CAPABILITIES as X } from '@/shared/external';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { addOrgMember, createContractor, createProjectAs, orgContextFor } from '@tests/setup/dg-fixtures';
import { externalContextBinder } from '@tests/setup/dg-fixtures-subcontract';
import { provisionTwoTenants } from '../projects/setup';

describe('Track E subcontract core (migration 0158)', () => {
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
    const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
    const siteManager = await addOrgMember(database, orgId, 'site');
    const surveyor = await addOrgMember(database, orgId, 'qs');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: siteManager.id, templateKey: 'site_manager' });
      await addProjectMember(context, { projectId, userId: surveyor.id, templateKey: 'quantity_surveyor' });
    });

    const asOwner = <T>(fn: (context: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
      database.asUser(userA.id, async (tx) => fn(await orgContextFor(tx, userA.id, orgId)));
    const asSite = <T>(fn: (context: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
      database.asUser(siteManager.id, async (tx) => fn(await orgContextFor(tx, siteManager.id, orgId)));
    const asQs = <T>(fn: (context: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
      database.asUser(surveyor.id, async (tx) => fn(await orgContextFor(tx, surveyor.id, orgId)));

    const { agreementId } = await asOwner((context) =>
      createDraftAgreement(context, {
        projectId,
        vendorId: contractorA.vendorId,
        title: 'Plaster works',
        trade: 'Plaster',
        retentionPercent: '5',
        retentionCapAmount: '10000',
        advancePercent: '10',
        advanceRecoveryMethod: 'proportional',
        vatTreatment: 'reverse_charge',
        paymentTermsDays: 60,
        startDate: '2026-10-01',
        endDate: '2026-12-31',
      }),
    );
    const lineIds = await asOwner(async (context) => {
      const rate = await addWorkLine(context, {
        agreementId,
        code: 'P-1',
        description: 'Interior plaster',
        unit: 'm2',
        quantity: '10',
        lineType: 'quantity_rate',
        unitPrice: '50',
      });
      const lump = await addWorkLine(context, {
        agreementId,
        code: 'P-2',
        description: 'Scaffolding',
        lineType: 'lump_sum',
        contractAmount: '1000',
      });
      return { rate: rate.workLineId, lump: lump.workLineId };
    });
    return { orgId, userA, projectId, contractorA, contractorB, siteManager, surveyor, agreementId, lineIds, asOwner, asSite, asQs };
  }

  it('locks the baseline on activation and records the original value event once', async () => {
    const s = await scenario();
    await s.asOwner(async (context) => {
      const draft = await getAgreementWorkspace(context, s.agreementId);
      expect(draft.financial?.originalAmount).toBe('1500.000000');
      expect(draft.availableActions).toEqual(expect.arrayContaining(['activate', 'cancel']));
      await changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' });
      const active = await getAgreementWorkspace(context, s.agreementId);
      expect(active.agreement.status).toBe('active');
      expect(active.agreement.baselineLockedAt).toBeInstanceOf(Date);
      expect(active.financial?.currentAmount).toBe('1500.000000');
      expect(active.financial?.vatTreatment).toBe('reverse_charge');
      await expect(
        addWorkLine(context, { agreementId: s.agreementId, description: 'Late line', lineType: 'lump_sum', contractAmount: '1' }),
      ).rejects.toMatchObject({ messageKey: 'subcontracts.errors.baselineLocked' });
      await expect(updateWorkLine(context, { workLineId: s.lineIds.rate, quantity: '20' })).rejects.toMatchObject({
        messageKey: 'subcontracts.errors.baselineLocked',
      });
      // operational details stay editable
      await updateWorkLine(context, { workLineId: s.lineIds.rate, plannedStart: '2026-10-05', plannedEnd: '2026-10-20' });
    });
    await database.asService(async (db) => {
      const events = await db.select().from(subcontractValueEvents).where(eq(subcontractValueEvents.subcontractId, s.agreementId));
      expect(events.map((event) => [event.kind, event.amount])).toEqual([['original', '1500.000000']]);
    });
  });

  it('never gives prices or terms to a site manager without contract.financial.view', async () => {
    const s = await scenario();
    await s.asOwner((context) => changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' }));
    await s.asSite(async (context) => {
      const workspace = await getAgreementWorkspace(context, s.agreementId);
      expect(workspace.access.canViewFinancial).toBe(false);
      expect(workspace.financial).toBeNull();
      expect(workspace.lines).toHaveLength(2);
      for (const line of workspace.lines) expect('financial' in line).toBe(false);
      expect(JSON.stringify(workspace)).not.toMatch(/1500\.0|500\.000000|unitPrice|contractAmount/);
      expect(await context.db.select().from(subcontractWorkLinePrices)).toHaveLength(0);
      expect(await context.db.select().from(subcontractAgreementFinancialTerms)).toHaveLength(0);
      expect(await context.db.select().from(subcontractValueEvents)).toHaveLength(0);
      await expect(changeAgreementStatus(context, { agreementId: s.agreementId, action: 'suspend', reason: 'x' })).rejects.toMatchObject({
        code: 'authorization_denied',
      });
    });
  });

  it('runs a change through negotiation; only approval moves the value', async () => {
    const s = await scenario();
    await s.asOwner((context) => changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' }));
    const { changeId } = await s.asSite(async (context) => {
      const created = await createChange(context, {
        agreementId: s.agreementId,
        changeType: 'addition',
        title: 'Extra plaster in lobby',
      });
      await submitChange(context, { changeId: created.changeId });
      await expect(proposeChangeVersion(context, { changeId: created.changeId, amount: '1' })).rejects.toMatchObject({
        code: 'authorization_denied',
      });
      return created;
    });

    await s.asQs((context) =>
      proposeChangeVersion(context, {
        changeId,
        note: 'QS offer',
        lines: [
          { workLineId: s.lineIds.rate, quantityDelta: '5', unitRate: '50' },
          { newLineDescription: 'Lobby cornice', newLineType: 'lump_sum', amountDelta: '300' },
        ],
      }),
    );
    await s.asQs(async (context) => {
      const position = await loadAgreementValuePosition(context.db, s.orgId, s.agreementId);
      expect(position?.current.amount).toBe('1500.000000');
    });

    // contractor counters -> under negotiation
    const bindA = await externalContextBinder(database, s.contractorA, s.orgId);
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const versionNo = await counterContractorChange(bindA(tx), {
        organizationId: s.orgId,
        changeId,
        lines: [
          { workLineId: s.lineIds.rate, quantityDelta: '5', unitRate: '60' },
          { newLineDescription: 'Lobby cornice', newLineType: 'lump_sum', amountDelta: '300' },
        ],
      });
      expect(versionNo.versionNo).toBe(2);
    });

    await s.asSite(async (context) => {
      await expect(approveChange(context, { changeId })).rejects.toMatchObject({ code: 'authorization_denied' });
      const { changes } = await listAgreementChanges(context, s.agreementId);
      expect(changes[0]!.status).toBe('under_negotiation');
      expect(changes[0]!.versions).toBeUndefined();
    });

    await s.asQs(async (context) => {
      const { changes } = await listAgreementChanges(context, s.agreementId);
      expect(changes[0]!.versions?.map((version) => version.amount)).toEqual(['550.000000', '600.000000']);
      await approveChange(context, { changeId });
      const position = await loadAgreementValuePosition(context.db, s.orgId, s.agreementId);
      expect(position?.approvedChanges.amount).toBe('600.000000');
      expect(position?.current.amount).toBe('2100.000000');
      const lines = await listRevisedWorkLines(context.db, s.orgId, s.agreementId);
      const rate = lines.find((line) => line.id === s.lineIds.rate)!;
      expect([rate.contractBaselineAmount, rate.approvedChangesAmount, rate.revisedAmount, rate.revisedQuantity]).toEqual([
        '500.000000',
        '300.000000',
        '800.000000',
        '15.000000',
      ]);
      const added = lines.find((line) => line.description === 'Lobby cornice')!;
      expect([added.isBaseline, added.contractBaselineAmount, added.revisedAmount]).toEqual([false, '0.000000', '300.000000']);
    });

    // decided changes and negotiation history are immutable
    await database.asUser(s.userA.id, async (tx) => {
      await expect(
        tx.update(subcontractChanges).set({ title: 'tamper' }).where(eq(subcontractChanges.id, changeId)),
      ).rejects.toBeDefined();
    });
    // no UPDATE/DELETE policy for clients; the append-only trigger also stops trusted writers
    await database.asUser(s.userA.id, async (tx) => {
      const updated = await tx
        .update(subcontractChangeVersions)
        .set({ amount: '1' })
        .where(eq(subcontractChangeVersions.changeId, changeId))
        .returning({ id: subcontractChangeVersions.id });
      expect(updated).toHaveLength(0);
      const deleted = await tx.delete(subcontractWorkLineAdjustments).returning({ id: subcontractWorkLineAdjustments.id });
      expect(deleted).toHaveLength(0);
    });
    await expect(
      database.asService((db) =>
        db.update(subcontractChangeVersions).set({ amount: '1' }).where(eq(subcontractChangeVersions.changeId, changeId)),
      ),
    ).rejects.toBeDefined();
    await expect(
      database.asService((db) => db.update(subcontractWorkLineAdjustments).set({ amountDelta: '1' })),
    ).rejects.toBeDefined();

    // events carry no money
    await database.asService(async (db) => {
      const rows = await db.select().from(domainEvents).where(eq(domainEvents.entityId, changeId));
      expect(rows.map((row) => row.eventType)).toEqual(
        expect.arrayContaining([
          'subcontract.change.created',
          'subcontract.change.submitted',
          'subcontract.change.version_proposed',
          'subcontract.change.approved',
        ]),
      );
      for (const row of rows) {
        const payload = row.payload as Record<string, unknown>;
        expect(payload).not.toHaveProperty('amount');
        expect(JSON.stringify(payload)).not.toMatch(/600\.000000|550\.000000|"unitRate"|"amountDelta"/);
      }
    });
  });

  it('rejects approval through raw SQL without change.financial.manage', async () => {
    const s = await scenario();
    await s.asOwner((context) => changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' }));
    const { changeId } = await s.asSite((context) =>
      createChange(context, { agreementId: s.agreementId, changeType: 'scope', title: 'Scope tweak' }),
    );
    await database.asUser(s.siteManager.id, async (tx) => {
      await expect(
        tx.execute(sql`update public.subcontract_changes set status = 'rejected' where id = ${changeId}::uuid`),
      ).rejects.toBeDefined();
    });
  });

  it('isolates contractor A from contractor B and hides values without ext.contract.view_value', async () => {
    const s = await scenario();
    await s.asOwner((context) => changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' }));
    const { changeId: internalDraft } = await s.asSite((context) =>
      createChange(context, { agreementId: s.agreementId, changeType: 'scope', title: 'Internal draft' }),
    );
    expect(internalDraft).toBeTruthy();

    const bindA = await externalContextBinder(database, s.contractorA, s.orgId);
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const view = await getContractorAgreement(bindA(tx), {
        organizationId: s.orgId,
        projectId: s.projectId,
        agreementId: s.agreementId,
      });
      expect(view.lines).toHaveLength(2);
      expect(view.financial?.currentAmount).toBe('1500.000000');
      const changes = await listContractorChanges(bindA(tx), {
        organizationId: s.orgId,
        projectId: s.projectId,
        agreementId: s.agreementId,
      });
      expect(changes.changes).toHaveLength(0);
    });

    const bindB = await externalContextBinder(database, s.contractorB, s.orgId);
    await database.asUser(s.contractorB.authUser.id, async (tx) => {
      await expect(
        getContractorAgreement(bindB(tx), { organizationId: s.orgId, projectId: s.projectId, agreementId: s.agreementId }),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await tx.select().from(subcontractChanges)).toHaveLength(0);
      await expect(
        submitContractorChangeProposal(bindB(tx), {
          organizationId: s.orgId,
          projectId: s.projectId,
          agreementId: s.agreementId,
          title: 'Hijack',
          amount: '1',
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });

    const viewer = await createContractor(database, {
      organizationId: s.orgId,
      projectId: s.projectId,
      label: 'viewer',
      vendorId: s.contractorA.vendorId,
      withAgreement: false,
      capabilities: [X.PROJECT_VIEW],
    });
    const bindViewer = await externalContextBinder(database, viewer, s.orgId);
    await database.asUser(viewer.authUser.id, async (tx) => {
      const view = await getContractorAgreement(bindViewer(tx), {
        organizationId: s.orgId,
        projectId: s.projectId,
        agreementId: s.agreementId,
      });
      expect(view.financial).toBeNull();
      expect(view.canProposeChange).toBe(false);
      for (const line of view.lines) expect('financial' in line).toBe(false);
      expect(await tx.select().from(subcontractWorkLinePrices)).toHaveLength(0);
      expect(await tx.select().from(subcontractValueEvents)).toHaveLength(0);
    });
  });

  it('lets the contractor propose a change that stays pending until internal decision', async () => {
    const s = await scenario();
    await s.asOwner((context) => changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' }));
    const bindA = await externalContextBinder(database, s.contractorA, s.orgId);
    const { changeId } = await database.asUser(s.contractorA.authUser.id, (tx) =>
      submitContractorChangeProposal(bindA(tx), {
        organizationId: s.orgId,
        projectId: s.projectId,
        agreementId: s.agreementId,
        title: 'Additional ceiling plaster',
        amount: '400',
        note: 'Per site request',
      }),
    );
    await s.asQs(async (context) => {
      const { changes } = await listAgreementChanges(context, s.agreementId);
      expect(changes[0]).toMatchObject({ origin: 'contractor', status: 'submitted', createdActorType: 'external' });
      expect((await loadAgreementValuePosition(context.db, s.orgId, s.agreementId))?.current.amount).toBe('1500.000000');
      await expect(rejectChange(context, { changeId })).rejects.toMatchObject({ code: 'validation_failed' });
      await rejectChange(context, { changeId, reason: 'Included in base scope' });
    });
    await database.asService(async (db) => {
      const [row] = await db.select().from(subcontractChanges).where(eq(subcontractChanges.id, changeId));
      expect(row?.status).toBe('rejected');
      expect(row?.valueEventId).toBeNull();
    });
  });

  it('records unpriced work and converts it into a draft change', async () => {
    const s = await scenario();
    await s.asOwner((context) => changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' }));
    const { unpricedWorkId } = await s.asSite((context) =>
      recordUnpricedWork(context, {
        agreementId: s.agreementId,
        title: 'Patch repair after electrician',
        workDate: '2026-10-10',
        issuerName: 'Site engineer',
      }),
    );
    const { changeId } = await s.asSite((context) => convertUnpricedWorkToChange(context, { unpricedWorkId }));
    await s.asSite(async (context) => {
      const page = await getProjectUnpricedWork(context, s.projectId, { status: 'all' });
      expect(page.items[0]).toMatchObject({ status: 'converted', convertedChangeId: changeId });
      const { changes } = await listAgreementChanges(context, s.agreementId);
      expect(changes.find((change) => change.id === changeId)).toMatchObject({ origin: 'unpriced_work', status: 'draft' });
      expect(await resolveEntityScope(context.db, 'unpriced_work', s.orgId, unpricedWorkId)).toMatchObject({
        projectId: s.projectId,
        vendorId: s.contractorA.vendorId,
        subcontractAgreementId: s.agreementId,
      });
      await expect(convertUnpricedWorkToChange(context, { unpricedWorkId })).rejects.toMatchObject({
        messageKey: 'subcontracts.errors.unpricedTransition',
      });
    });
  });

  it('creates a draft change from a site instruction and blocks closing with open changes', async () => {
    const s = await scenario();
    await s.asOwner((context) => changeAgreementStatus(context, { agreementId: s.agreementId, action: 'activate' }));
    const instructionId = '00000000-0000-4000-8000-0000000000aa';
    const { changeId } = await s.asSite((context) =>
      createChangeFromInstruction(context, { agreementId: s.agreementId, instructionId, title: 'Move partition' }),
    );
    await s.asOwner(async (context) => {
      const scope = await resolveEntityScope(context.db, 'subcontract_change', s.orgId, changeId);
      expect(scope).toMatchObject({ subcontractAgreementId: s.agreementId, internalOnly: true });
      await expect(changeAgreementStatus(context, { agreementId: s.agreementId, action: 'suspend' })).rejects.toMatchObject({
        code: 'validation_failed',
      });
      await changeAgreementStatus(context, { agreementId: s.agreementId, action: 'suspend', reason: 'Safety stop' });
      await changeAgreementStatus(context, { agreementId: s.agreementId, action: 'resume' });
      await changeAgreementStatus(context, { agreementId: s.agreementId, action: 'complete' });
      await expect(changeAgreementStatus(context, { agreementId: s.agreementId, action: 'close' })).rejects.toMatchObject({
        messageKey: 'subcontracts.errors.closeBlocked',
      });
    });
  });
});

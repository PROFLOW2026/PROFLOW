import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approveChangeRequest,
  cancelChangeRequest,
  createChangeRequest,
  rejectChangeRequest,
  submitChangeRequestForApproval,
} from '@/modules/commercial';
import {
  createProject,
  getProjectDetail,
  updateProject,
  upsertPrimaryContractAmount,
} from '@/modules/projects';
import { DomainRuleError } from '@/shared/errors';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('original contract amount lock after approved change', () => {
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

  async function createPricedProject(userId: string, organizationId: string, name: string) {
    return database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'he-IL',
      });
      const { projectId } = await createProject(context, {
        name,
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      return getProjectDetail(context, projectId);
    });
  }

  it('keeps original amount editable when there are no approved changes', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const created = await createPricedProject(userA.id, orgA.organization.id, 'Editable job');

    expect(created.originalContractAmountLocked).toBe(false);

    const updated = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      await updateProject(context, {
        projectId: created.project.id,
        contractValueAmount: '120000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      return getProjectDetail(context, created.project.id);
    });

    expect(updated.contract?.enteredValueAmount).toBe('120000.000000');
    expect(updated.contract?.originalValueAmount).toBe('120000.000000');
    expect(updated.originalContractAmountLocked).toBe(false);
  });

  it('does not lock for draft, rejected, or cancelled change requests', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const created = await createPricedProject(userA.id, orgA.organization.id, 'Draft CR job');

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });

      const draft = await createChangeRequest(context, {
        projectId: created.project.id,
        title: 'Draft extras',
        direction: 'addition',
        requestedAmount: '2500',
      });
      let detail = await getProjectDetail(context, created.project.id);
      expect(detail.originalContractAmountLocked).toBe(false);

      const rejected = await createChangeRequest(context, {
        projectId: created.project.id,
        title: 'Rejected extras',
        direction: 'addition',
        requestedAmount: '1000',
      });
      await submitChangeRequestForApproval(context, rejected.changeRequestId);
      await rejectChangeRequest(context, rejected.changeRequestId);
      detail = await getProjectDetail(context, created.project.id);
      expect(detail.originalContractAmountLocked).toBe(false);

      const cancelled = await createChangeRequest(context, {
        projectId: created.project.id,
        title: 'Cancelled extras',
        direction: 'addition',
        requestedAmount: '500',
      });
      await cancelChangeRequest(context, cancelled.changeRequestId);
      detail = await getProjectDetail(context, created.project.id);
      expect(detail.originalContractAmountLocked).toBe(false);

      // Draft still present - still unlocked.
      expect(draft.changeRequestId).toBeTruthy();
      await updateProject(context, {
        projectId: created.project.id,
        contractValueAmount: '110000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: true,
      });
      detail = await getProjectDetail(context, created.project.id);
      expect(detail.contract?.amountIncludesTax).toBe(true);
      expect(detail.contract?.originalValueAmount).toBe('93220.338983');
    });
  });

  it('locks original amount and VAT mode after an approved change order', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const created = await createPricedProject(userA.id, orgA.organization.id, 'Approved CO job');

    const beforeLock = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const change = await createChangeRequest(context, {
        projectId: created.project.id,
        title: 'Approved addition',
        direction: 'addition',
        requestedAmount: '5000',
      });
      await submitChangeRequestForApproval(context, change.changeRequestId);
      await approveChangeRequest(context, {
        changeRequestId: change.changeRequestId,
        effectiveDate: '2026-08-01',
      });
      return getProjectDetail(context, created.project.id);
    });

    expect(beforeLock.originalContractAmountLocked).toBe(true);
    expect(beforeLock.contract?.originalValueAmount).toBe('100000.000000');
    expect(beforeLock.contract?.amountIncludesTax).toBe(false);
    expect(beforeLock.contract?.taxSnapshot?.netAmount).toBe('100000.000000');
    const changeOrderEvent = beforeLock.contractValueEvents.find((event) => event.kind === 'change_order');
    expect(changeOrderEvent?.amount).toBe('5000.000000');
    const snapshotBefore = beforeLock.contract?.taxSnapshot;

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });

      await expect(
        updateProject(context, {
          projectId: created.project.id,
          contractValueAmount: '200000',
          contractValueCurrency: 'ILS',
          amountIncludesTax: false,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(
        updateProject(context, {
          projectId: created.project.id,
          contractValueAmount: '100000',
          contractValueCurrency: 'ILS',
          amountIncludesTax: true,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      await expect(
        upsertPrimaryContractAmount(context, {
          projectId: created.project.id,
          enteredAmount: '200000',
          currency: 'ILS',
          amountIncludesTax: false,
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);

      // Non-financial fields remain editable.
      await updateProject(context, {
        projectId: created.project.id,
        name: 'Approved CO job renamed',
        location: 'Tel Aviv',
      });

      const after = await getProjectDetail(context, created.project.id);
      expect(after.project.name).toBe('Approved CO job renamed');
      expect(after.project.location).toBe('Tel Aviv');
      expect(after.contract?.enteredValueAmount).toBe('100000.000000');
      expect(after.contract?.originalValueAmount).toBe('100000.000000');
      expect(after.contract?.amountIncludesTax).toBe(false);
      expect(after.contract?.taxSnapshot).toEqual(snapshotBefore);
      expect(after.contractValueEvents.find((event) => event.kind === 'change_order')?.amount).toBe(
        '5000.000000',
      );
      expect(after.currentContractValue?.amount).toBe('105000.000000');
    });
  });
});

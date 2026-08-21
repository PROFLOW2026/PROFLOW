import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  createApprovalRule,
  decideApprovalRequest,
  replaceApprovalRuleStepsForRule,
  submitApprovalRequest,
} from '@/modules/approvals';
import { resolveOrgContext } from '@/modules/tenancy';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  createTestOrganization,
  createTestUser,
  seedSystem,
  type TestUser,
} from '../../setup/fixtures';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';

describe('approval request step snapshots (Approvals 2.0)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let outsider: TestUser;
  let orgId: string;
  let entityId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
    owner = await createTestUser(database, 'approvals-owner@example.test');
    outsider = await createTestUser(database, 'approvals-outsider@example.test');
    const org = await createTestOrganization(database, owner, 'Approvals Snapshot Org');
    orgId = org.organization.id;
    entityId = randomUUID();
  });

  it('copies rule steps into immutable request snapshots at submit', async () => {
    const rule = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      return createApprovalRule(context, {
        name: 'Large expense',
        entityType: 'expense',
        thresholdAmount: '1000',
        currency: 'ILS',
        steps: [
          {
            stepOrder: 1,
            name: 'Manager gate',
            approverStrategy: 'role_template',
            roleTemplateKey: 'manager',
          },
          {
            stepOrder: 2,
            name: 'Finance gate',
            approverStrategy: 'role_template',
            roleTemplateKey: 'finance',
          },
        ],
      });
    });

    const submitted = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      return submitApprovalRequest(context, {
        entityType: 'expense',
        entityId,
        amount: '5000',
        currency: 'ILS',
      });
    });
    expect(submitted.kind).toBe('submitted');
    if (submitted.kind !== 'submitted') return;

    const requestSteps = await database.asUser(owner.id, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT step_order, name, approver_strategy, role_template_key, status
        FROM approval_request_steps
        WHERE request_id = ${submitted.request.id}::uuid
        ORDER BY step_order
      `);
      return resultRows<Record<string, unknown>>(rows);
    });

    expect(requestSteps).toHaveLength(2);
    expect(requestSteps[0]).toMatchObject({
      step_order: 1,
      name: 'Manager gate',
      approver_strategy: 'role_template',
      role_template_key: 'manager',
      status: 'pending',
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      await replaceApprovalRuleStepsForRule(context, {
        ruleId: rule.id,
        steps: [
          {
            stepOrder: 1,
            name: 'Changed owner step',
            approverStrategy: 'role_template',
            roleTemplateKey: 'owner',
          },
        ],
      });
    });

    const afterEdit = await database.asUser(owner.id, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT step_order, name, role_template_key
        FROM approval_request_steps
        WHERE request_id = ${submitted.request.id}::uuid
        ORDER BY step_order
      `);
      return resultRows<Record<string, unknown>>(rows);
    });

    expect(afterEdit).toHaveLength(2);
    expect(afterEdit[0]).toMatchObject({
      step_order: 1,
      name: 'Manager gate',
      role_template_key: 'manager',
    });
    expect(afterEdit[1]).toMatchObject({
      step_order: 2,
      name: 'Finance gate',
      role_template_key: 'finance',
    });
  });

  it('blocks cross-org user on approval_rule_steps (membership FK)', async () => {
    const ruleId = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const rule = await createApprovalRule(context, {
        name: 'User step rule',
        entityType: 'expense',
        thresholdAmount: null,
        currency: 'ILS',
      });
      return rule.id;
    });

    await expect(
      database.asUser(owner.id, async (tx) => {
        await tx.execute(sql`
          INSERT INTO approval_rule_steps (
            organization_id, rule_id, step_order, approver_strategy, user_id
          ) VALUES (
            ${orgId}::uuid, ${ruleId}::uuid, 1, 'user', ${outsider.id}::uuid
          )
        `);
      }),
    ).rejects.toThrow();
  });

  it('legacy 0-step rule submits with null current/total and single decide path', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      await createApprovalRule(context, {
        name: 'Legacy expense',
        entityType: 'expense',
        thresholdAmount: '100',
        currency: 'ILS',
      });
    });

    const submitted = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      return submitApprovalRequest(context, {
        entityType: 'expense',
        entityId,
        amount: '500',
        currency: 'ILS',
      });
    });
    expect(submitted.kind).toBe('submitted');
    if (submitted.kind !== 'submitted') return;

    expect(submitted.request.currentStepOrder).toBeNull();
    expect(submitted.request.totalSteps).toBeNull();

    const stepCount = await database.asUser(owner.id, async (tx) => {
      const rows = await tx.execute(sql`
        SELECT count(*)::int AS count
        FROM approval_request_steps
        WHERE request_id = ${submitted.request.id}::uuid
      `);
      const list = resultRows<{ count: number }>(rows);
      return list[0]?.count ?? 0;
    });
    expect(stepCount).toBe(0);

    const decided = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      expect(context.permissions.has(PERMISSIONS.APPROVALS_DECIDE)).toBe(true);
      return decideApprovalRequest(context, {
        requestId: submitted.request.id,
        decision: 'approved',
      });
    });
    expect(decided.status).toBe('approved');
  });

  it('rejects duplicate step orders at insert time', async () => {
    await expect(
      database.asService(async (db) => {
        const { insertApprovalRequestSteps } = await import(
          '@/modules/approvals/data/approvals.repository'
        );
        await insertApprovalRequestSteps(db, orgId, randomUUID(), [
          {
            stepOrder: 1,
            name: 'A',
            approverStrategy: 'role_template',
            roleTemplateKey: 'manager',
            permissionKey: null,
            userId: null,
          },
          {
            stepOrder: 1,
            name: 'B',
            approverStrategy: 'role_template',
            roleTemplateKey: 'finance',
            permissionKey: null,
            userId: null,
          },
        ]);
      }),
    ).rejects.toThrow(/duplicate stepOrder/i);
  });
});

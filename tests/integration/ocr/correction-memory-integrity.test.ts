import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createTestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../projects/setup';

function errorBlob(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as { message?: string; cause?: unknown; detail?: string; code?: string };
  return [e.message, e.detail, e.code, errorBlob(e.cause)].filter(Boolean).join('\n');
}

async function expectFailure(run: () => Promise<unknown>, token: string | RegExp) {
  let message = '';
  try {
    await run();
  } catch (error) {
    message = errorBlob(error);
  }
  if (token instanceof RegExp) {
    expect(message, `expected failure matching ${token}`).toMatch(token);
    return;
  }
  expect(message, `expected failure containing ${token}`).toContain(token);
}

async function onboardCustomRole(
  database: TestDatabase,
  organizationId: string,
  email: string,
  roleKey: string,
  permissionKeys: readonly string[],
) {
  const user = await createTestUser(database, email);
  await database.asService(async (db) => {
    const roleRows = resultRows<{ id: string }>(
      await db.execute(sql`
        INSERT INTO roles (organization_id, key, name, rank, is_protected)
        VALUES (${organizationId}::uuid, ${roleKey}, ${roleKey}, 80, false)
        RETURNING id
      `),
    );
    const roleId = roleRows[0]!.id;
    for (const permissionKey of permissionKeys) {
      await db.execute(sql`
        INSERT INTO role_permissions (organization_id, role_id, permission_key)
        VALUES (${organizationId}::uuid, ${roleId}::uuid, ${permissionKey})
      `);
    }
    const membershipRows = resultRows<{ id: string }>(
      await db.execute(sql`
        INSERT INTO organization_memberships (organization_id, user_id, status)
        VALUES (${organizationId}::uuid, ${user.id}::uuid, 'active')
        RETURNING id
      `),
    );
    await db.execute(sql`
      INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
      VALUES (
        ${organizationId}::uuid,
        ${membershipRows[0]!.id}::uuid,
        ${user.id}::uuid,
        ${roleId}::uuid
      )
    `);
  });
  return user;
}

describe('0054 OCR correction memory integrity and RLS', () => {
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

  async function seedOrgGraph() {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const otherOrgId = orgB.organization.id;
    const projectA = randomUUID();
    const projectB = randomUUID();
    const otherProject = randomUUID();
    const vendorA = randomUUID();
    const vendorB = randomUUID();
    const otherVendor = randomUUID();
    const poA = randomUUID();
    const poB = randomUUID();
    const poOrgLevel = randomUUID();
    const otherPo = randomUUID();
    const agreementA = randomUUID();
    const agreementB = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency) VALUES
          (${projectA}::uuid, ${orgId}::uuid, 'Project A', 'active', 'ILS'),
          (${projectB}::uuid, ${orgId}::uuid, 'Project B', 'active', 'ILS'),
          (${otherProject}::uuid, ${otherOrgId}::uuid, 'Other Project', 'active', 'ILS')
      `);
      await db.execute(sql`
        INSERT INTO vendors (id, organization_id, name) VALUES
          (${vendorA}::uuid, ${orgId}::uuid, 'Vendor A'),
          (${vendorB}::uuid, ${orgId}::uuid, 'Vendor B'),
          (${otherVendor}::uuid, ${otherOrgId}::uuid, 'Other Vendor')
      `);
      await db.execute(sql`
        INSERT INTO purchase_orders (
          id, organization_id, vendor_id, project_id, status, currency, committed_amount
        ) VALUES
          (${poA}::uuid, ${orgId}::uuid, ${vendorA}::uuid, ${projectA}::uuid, 'issued', 'ILS', 100),
          (${poB}::uuid, ${orgId}::uuid, ${vendorB}::uuid, ${projectB}::uuid, 'issued', 'ILS', 100),
          (${poOrgLevel}::uuid, ${orgId}::uuid, ${vendorA}::uuid, NULL, 'issued', 'ILS', 50),
          (${otherPo}::uuid, ${otherOrgId}::uuid, ${otherVendor}::uuid, ${otherProject}::uuid, 'issued', 'ILS', 100)
      `);
      await db.execute(sql`
        INSERT INTO subcontract_agreements (
          id, organization_id, vendor_id, project_id, title, status, original_amount, currency
        ) VALUES
          (${agreementA}::uuid, ${orgId}::uuid, ${vendorA}::uuid, ${projectA}::uuid, 'Ag A', 'draft', 1, 'ILS'),
          (${agreementB}::uuid, ${orgId}::uuid, ${vendorB}::uuid, ${projectB}::uuid, 'Ag B', 'draft', 1, 'ILS')
      `);
    });

    return {
      orgId,
      otherOrgId,
      userA,
      userB,
      projectA,
      projectB,
      otherProject,
      vendorA,
      vendorB,
      otherVendor,
      poA,
      poB,
      poOrgLevel,
      otherPo,
      agreementA,
      agreementB,
    };
  }

  it('accepts same-org valid mappings including org-level PO', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'vendor', 'name:vendor-a', ${graph.vendorA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'project', 'vendor:project-a',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-a',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-org',
          ${graph.vendorA}::uuid, NULL, ${graph.poOrgLevel}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          subcontract_agreement_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'subcontract_agreement', 'vendor:ag-a',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.agreementA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      const rows = resultRows<{ n: string }>(
        await db.execute(sql`SELECT count(*)::text AS n FROM ocr_correction_memory`),
      );
      expect(rows[0]?.n).toBe('5');
    });
  });

  it('rejects cross-org targets', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id
            ) VALUES (
              ${graph.orgId}::uuid, 'vendor', 'name:other', ${graph.otherVendor}::uuid
            )
          `),
        /foreign_key_violation|violates foreign key|Failed query/i,
      );
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, project_id
            ) VALUES (
              ${graph.orgId}::uuid, 'project', 'other-project', ${graph.otherProject}::uuid
            )
          `),
        /foreign_key_violation|violates foreign key|Failed query/i,
      );
    });
  });

  it('rejects PO project/vendor spoofing and NULL project bypass', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, project_id, purchase_order_id
            ) VALUES (
              ${graph.orgId}::uuid, 'purchase_order', 'po-wrong-project',
              ${graph.vendorA}::uuid, ${graph.projectB}::uuid, ${graph.poA}::uuid
            )
          `),
        'must match purchase order project',
      );
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, project_id, purchase_order_id
            ) VALUES (
              ${graph.orgId}::uuid, 'purchase_order', 'po-null-bypass',
              ${graph.vendorA}::uuid, NULL, ${graph.poA}::uuid
            )
          `),
        'must match purchase order project',
      );
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, project_id, purchase_order_id
            ) VALUES (
              ${graph.orgId}::uuid, 'purchase_order', 'po-wrong-vendor',
              ${graph.vendorB}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid
            )
          `),
        'must match purchase order vendor',
      );
    });
  });

  it('rejects agreement project/vendor spoofing and NULL project bypass', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, project_id, subcontract_agreement_id
            ) VALUES (
              ${graph.orgId}::uuid, 'subcontract_agreement', 'ag-wrong-project',
              ${graph.vendorA}::uuid, ${graph.projectB}::uuid, ${graph.agreementA}::uuid
            )
          `),
        'must match agreement project',
      );
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, project_id, subcontract_agreement_id
            ) VALUES (
              ${graph.orgId}::uuid, 'subcontract_agreement', 'ag-null-bypass',
              ${graph.vendorA}::uuid, NULL, ${graph.agreementA}::uuid
            )
          `),
        /check_violation|target_shape|Failed query|not-null/i,
      );
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, project_id, subcontract_agreement_id
            ) VALUES (
              ${graph.orgId}::uuid, 'subcontract_agreement', 'ag-wrong-vendor',
              ${graph.vendorB}::uuid, ${graph.projectA}::uuid, ${graph.agreementA}::uuid
            )
          `),
        'must match agreement vendor',
      );
    });
  });

  it('accepts same-org confirmer and rejects cross-org / false authenticated attribution', async () => {
    const graph = await seedOrgGraph();
    const extra = await onboardCustomRole(
      database,
      graph.orgId,
      'confirmer@example.test',
      'confirmer_role',
      ['documents.read', 'documents.manage', 'vendors.read'],
    );

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'vendor', 'name:legit', ${graph.vendorA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await expectFailure(
        () =>
          db.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
            ) VALUES (
              ${graph.orgId}::uuid, 'vendor', 'name:cross-org', ${graph.vendorA}::uuid, ${graph.userB.id}::uuid
            )
          `),
        /confirmer must be an active member|foreign_key_violation|Failed query/i,
      );
    });

    await expectFailure(
      () =>
        database.asUser(graph.userA.id, async (tx) => {
          await tx.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
            ) VALUES (
              ${graph.orgId}::uuid, 'vendor', 'name:false-attr', ${graph.vendorA}::uuid, ${extra.id}::uuid
            )
          `);
        }),
      'cannot attribute confirmation to another user',
    );

    await database.asUser(graph.userA.id, async (tx) => {
      await tx.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'vendor', 'name:self', ${graph.vendorA}::uuid, ${graph.userA.id}::uuid
        )
      `);
    });
  });

  it('profile deletion nulls only last_confirmed_by_user_id', async () => {
    const graph = await seedOrgGraph();
    const member = await onboardCustomRole(
      database,
      graph.orgId,
      'to-delete@example.test',
      'delete_me',
      ['documents.read', 'vendors.read'],
    );
    const memoryId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${memoryId}::uuid, ${graph.orgId}::uuid, 'vendor', 'name:delete-me',
          ${graph.vendorA}::uuid, ${member.id}::uuid
        )
      `);
      await db.execute(sql`DELETE FROM profiles WHERE id = ${member.id}::uuid`);
      const rows = resultRows<{ org: string; confirmer: string | null }>(
        await db.execute(sql`
          SELECT organization_id::text AS org, last_confirmed_by_user_id::text AS confirmer
          FROM ocr_correction_memory
          WHERE id = ${memoryId}::uuid
        `),
      );
      expect(rows[0]?.org).toBe(graph.orgId);
      expect(rows[0]?.confirmer).toBeNull();
    });
  });

  it('membership deletion nulls only last_confirmed_by_user_id and keeps organization_id', async () => {
    const graph = await seedOrgGraph();
    const member = await onboardCustomRole(
      database,
      graph.orgId,
      'leave-org@example.test',
      'leave_org',
      ['documents.read', 'vendors.read'],
    );
    const memoryId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${memoryId}::uuid, ${graph.orgId}::uuid, 'vendor', 'name:leave-org',
          ${graph.vendorA}::uuid, ${member.id}::uuid
        )
      `);
      await db.execute(sql`
        DELETE FROM organization_memberships
        WHERE organization_id = ${graph.orgId}::uuid AND user_id = ${member.id}::uuid
      `);
      const rows = resultRows<{ org: string; confirmer: string | null }>(
        await db.execute(sql`
          SELECT organization_id::text AS org, last_confirmed_by_user_id::text AS confirmer
          FROM ocr_correction_memory
          WHERE id = ${memoryId}::uuid
        `),
      );
      expect(rows[0]?.org).toBe(graph.orgId);
      expect(rows[0]?.confirmer).toBeNull();
    });
  });

  it('FORCE RLS: documents.read alone cannot see protected vendor/PO/agreement targets', async () => {
    const graph = await seedOrgGraph();
    const docsOnly = await onboardCustomRole(
      database,
      graph.orgId,
      'docs-only@example.test',
      'docs_only',
      ['documents.read'],
    );
    const vendorReader = await onboardCustomRole(
      database,
      graph.orgId,
      'vendor-reader@example.test',
      'vendor_reader',
      ['documents.read', 'vendors.read'],
    );
    const poReader = await onboardCustomRole(
      database,
      graph.orgId,
      'po-reader@example.test',
      'po_reader',
      ['documents.read', 'procurement.read'],
    );

    const vendorMem = randomUUID();
    const poMem = randomUUID();
    const agMem = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${vendorMem}::uuid, ${graph.orgId}::uuid, 'vendor', 'name:rls-vendor',
          ${graph.vendorA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${poMem}::uuid, ${graph.orgId}::uuid, 'purchase_order', 'name:rls-po',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id, project_id,
          subcontract_agreement_id, last_confirmed_by_user_id
        ) VALUES (
          ${agMem}::uuid, ${graph.orgId}::uuid, 'subcontract_agreement', 'name:rls-ag',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.agreementA}::uuid, ${graph.userA.id}::uuid
        )
      `);
    });

    const docsIds = await database.asUser(docsOnly.id, async (tx) =>
      resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM ocr_correction_memory`)).map(
        (row) => row.id,
      ),
    );
    expect(docsIds).toEqual([]);

    const vendorIds = await database.asUser(vendorReader.id, async (tx) =>
      resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM ocr_correction_memory`)).map(
        (row) => row.id,
      ),
    );
    expect(vendorIds.sort()).toEqual([agMem, vendorMem].sort());

    const poIds = await database.asUser(poReader.id, async (tx) =>
      resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM ocr_correction_memory`)).map(
        (row) => row.id,
      ),
    );
    expect(poIds).toEqual([poMem]);
  });

  it('project-access gates the real PO/agreement project, not a spoofed project_id', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO organization_settings (organization_id, key, value)
        VALUES (${graph.orgId}::uuid, 'project_access_mode', '"selected"'::jsonb)
        ON CONFLICT (organization_id, key) DO UPDATE SET value = excluded.value
      `);
    });

    const scoped = await onboardCustomRole(
      database,
      graph.orgId,
      'scoped-a@example.test',
      'scoped_a',
      ['documents.read', 'documents.manage', 'procurement.read', 'vendors.read'],
    );
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO project_access_grants (organization_id, user_id, project_id, access_level)
        VALUES (${graph.orgId}::uuid, ${scoped.id}::uuid, ${graph.projectA}::uuid, 'read')
      `);
    });

    const memA = randomUUID();
    const memB = randomUUID();
    const agB = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES
          (
            ${memA}::uuid, ${graph.orgId}::uuid, 'purchase_order', 'po-a-mem',
            ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid, ${graph.userA.id}::uuid
          ),
          (
            ${memB}::uuid, ${graph.orgId}::uuid, 'purchase_order', 'po-b-mem',
            ${graph.vendorB}::uuid, ${graph.projectB}::uuid, ${graph.poB}::uuid, ${graph.userA.id}::uuid
          )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id, project_id,
          subcontract_agreement_id, last_confirmed_by_user_id
        ) VALUES (
          ${agB}::uuid, ${graph.orgId}::uuid, 'subcontract_agreement', 'ag-b-mem',
          ${graph.vendorB}::uuid, ${graph.projectB}::uuid, ${graph.agreementB}::uuid, ${graph.userA.id}::uuid
        )
      `);
    });

    const visible = await database.asUser(scoped.id, async (tx) =>
      resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM ocr_correction_memory`)).map(
        (row) => row.id,
      ),
    );
    expect(visible).toEqual([memA]);

    await expectFailure(
      () =>
        database.asUser(scoped.id, async (tx) => {
          await tx.execute(sql`
            INSERT INTO ocr_correction_memory (
              organization_id, mapping_kind, source_key, vendor_id, project_id, purchase_order_id,
              last_confirmed_by_user_id
            ) VALUES (
              ${graph.orgId}::uuid, 'purchase_order', 'po-b-write',
              ${graph.vendorB}::uuid, ${graph.projectB}::uuid, ${graph.poB}::uuid, ${scoped.id}::uuid
            )
          `);
        }),
      /row-level security|Failed query|violates/i,
    );
  });

  it('authenticated updates cannot keep another user as confirmer; legitimate restamp and service_role pass', async () => {
    const graph = await seedOrgGraph();
    const userB = await onboardCustomRole(
      database,
      graph.orgId,
      'user-b-writer@example.test',
      'user_b_writer',
      ['documents.read', 'documents.manage', 'vendors.read'],
    );
    const memoryId = randomUUID();
    const originalConfirmedAt = '2026-01-01T00:00:00.000Z';

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          id, organization_id, mapping_kind, source_key, vendor_id,
          source_vendor_name, source_identifier, source_currency,
          confirmed_count, last_confirmed_at, last_confirmed_by_user_id
        ) VALUES (
          ${memoryId}::uuid, ${graph.orgId}::uuid, 'vendor', 'name:user-a',
          ${graph.vendorA}::uuid, 'Vendor A', '512345678', 'ILS',
          3, ${originalConfirmedAt}::timestamptz, ${graph.userA.id}::uuid
        )
      `);
    });

    await expectFailure(
      () =>
        database.asUser(userB.id, async (tx) => {
          await tx.execute(sql`
            UPDATE ocr_correction_memory
            SET source_key = 'name:hijack-key'
            WHERE id = ${memoryId}::uuid
          `);
        }),
      'cannot attribute confirmation to another user',
    );

    await expectFailure(
      () =>
        database.asUser(userB.id, async (tx) => {
          await tx.execute(sql`
            UPDATE ocr_correction_memory
            SET
              source_vendor_name = 'Hijacked',
              source_identifier = '999',
              source_currency = 'USD',
              confirmed_count = 99,
              last_confirmed_at = now()
            WHERE id = ${memoryId}::uuid
          `);
        }),
      'cannot attribute confirmation to another user',
    );

    const afterReject = await database.asService(async (db) =>
      resultRows<{
        source_key: string;
        confirmed_count: number;
        confirmer: string | null;
        confirmed_at: string;
      }>(
        await db.execute(sql`
          SELECT source_key, confirmed_count,
            last_confirmed_by_user_id::text AS confirmer,
            last_confirmed_at::text AS confirmed_at
          FROM ocr_correction_memory
          WHERE id = ${memoryId}::uuid
        `),
      )[0],
    );
    expect(afterReject?.source_key).toBe('name:user-a');
    expect(Number(afterReject?.confirmed_count)).toBe(3);
    expect(afterReject?.confirmer).toBe(graph.userA.id);

    const beforeLegit = Date.now();
    await database.asUser(userB.id, async (tx) => {
      await tx.execute(sql`
        UPDATE ocr_correction_memory
        SET source_key = 'name:user-b', last_confirmed_by_user_id = ${userB.id}::uuid
        WHERE id = ${memoryId}::uuid
      `);
    });
    const afterLegit = await database.asService(async (db) =>
      resultRows<{
        source_key: string;
        confirmer: string | null;
        confirmed_at: string;
      }>(
        await db.execute(sql`
          SELECT source_key, last_confirmed_by_user_id::text AS confirmer,
            last_confirmed_at AS confirmed_at
          FROM ocr_correction_memory
          WHERE id = ${memoryId}::uuid
        `),
      )[0],
    );
    expect(afterLegit?.source_key).toBe('name:user-b');
    expect(afterLegit?.confirmer).toBe(userB.id);
    expect(new Date(afterLegit!.confirmed_at).getTime()).toBeGreaterThanOrEqual(beforeLegit - 2000);

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        UPDATE ocr_correction_memory
        SET source_identifier = 'service-touch'
        WHERE id = ${memoryId}::uuid
      `);
      const serviceRow = resultRows<{ identifier: string | null; confirmer: string | null }>(
        await db.execute(sql`
          SELECT source_identifier AS identifier, last_confirmed_by_user_id::text AS confirmer
          FROM ocr_correction_memory
          WHERE id = ${memoryId}::uuid
        `),
      )[0];
      expect(serviceRow?.identifier).toBe('service-touch');
      expect(serviceRow?.confirmer).toBe(userB.id);
    });
  });

  it('discards purchase_order memory when PO project_id changes A → B', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-a',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'vendor', 'name:keep-vendor', ${graph.vendorA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-b',
          ${graph.vendorB}::uuid, ${graph.projectB}::uuid, ${graph.poB}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        UPDATE purchase_orders
        SET project_id = ${graph.projectB}::uuid
        WHERE id = ${graph.poA}::uuid
      `);
      const po = resultRows<{ project_id: string | null }>(
        await db.execute(sql`
          SELECT project_id::text AS project_id FROM purchase_orders WHERE id = ${graph.poA}::uuid
        `),
      )[0];
      expect(po?.project_id).toBe(graph.projectB);

      const stale = resultRows<{ n: string }>(
        await db.execute(sql`
          SELECT count(*)::text AS n FROM ocr_correction_memory
          WHERE purchase_order_id = ${graph.poA}::uuid
        `),
      );
      expect(stale[0]?.n).toBe('0');

      const kept = resultRows<{ source_key: string; confirmer: string | null }>(
        await db.execute(sql`
          SELECT source_key, last_confirmed_by_user_id::text AS confirmer
          FROM ocr_correction_memory
          ORDER BY source_key
        `),
      );
      expect(kept.map((row) => row.source_key)).toEqual(['name:keep-vendor', 'vendor:po-b']);
      expect(kept.every((row) => row.confirmer === graph.userA.id)).toBe(true);
    });
  });

  it('discards purchase_order memory when PO project_id changes A → NULL', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-a-null',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        UPDATE purchase_orders
        SET project_id = NULL
        WHERE id = ${graph.poA}::uuid
      `);
      const po = resultRows<{ project_id: string | null }>(
        await db.execute(sql`
          SELECT project_id FROM purchase_orders WHERE id = ${graph.poA}::uuid
        `),
      )[0];
      expect(po?.project_id).toBeNull();

      const stale = resultRows<{ n: string }>(
        await db.execute(sql`
          SELECT count(*)::text AS n FROM ocr_correction_memory
          WHERE purchase_order_id = ${graph.poA}::uuid
        `),
      );
      expect(stale[0]?.n).toBe('0');
    });
  });

  it('discards purchase_order memory when org-level PO is assigned a project', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-org',
          ${graph.vendorA}::uuid, NULL, ${graph.poOrgLevel}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        UPDATE purchase_orders
        SET project_id = ${graph.projectA}::uuid
        WHERE id = ${graph.poOrgLevel}::uuid
      `);
      const po = resultRows<{ project_id: string | null }>(
        await db.execute(sql`
          SELECT project_id::text AS project_id
          FROM purchase_orders WHERE id = ${graph.poOrgLevel}::uuid
        `),
      )[0];
      expect(po?.project_id).toBe(graph.projectA);

      const stale = resultRows<{ n: string }>(
        await db.execute(sql`
          SELECT count(*)::text AS n FROM ocr_correction_memory
          WHERE purchase_order_id = ${graph.poOrgLevel}::uuid
        `),
      );
      expect(stale[0]?.n).toBe('0');
    });
  });

  it('does not discard another organization PO memory when this org PO moves', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-a',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.otherOrgId}::uuid, 'purchase_order', 'vendor:other-po',
          ${graph.otherVendor}::uuid, ${graph.otherProject}::uuid,
          ${graph.otherPo}::uuid, ${graph.userB.id}::uuid
        )
      `);
      await db.execute(sql`
        UPDATE purchase_orders
        SET project_id = ${graph.projectB}::uuid
        WHERE id = ${graph.poA}::uuid
      `);
      const leftover = resultRows<{
        org: string;
        source_key: string;
        confirmer: string | null;
        po: string;
      }>(
        await db.execute(sql`
          SELECT organization_id::text AS org, source_key,
            last_confirmed_by_user_id::text AS confirmer,
            purchase_order_id::text AS po
          FROM ocr_correction_memory
        `),
      );
      expect(leftover).toHaveLength(1);
      expect(leftover[0]?.org).toBe(graph.otherOrgId);
      expect(leftover[0]?.source_key).toBe('vendor:other-po');
      expect(leftover[0]?.po).toBe(graph.otherPo);
      expect(leftover[0]?.confirmer).toBe(graph.userB.id);
    });
  });

  it('discards purchase_order memory when PO vendor_id changes without restamping', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, project_id,
          purchase_order_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'purchase_order', 'vendor:po-a',
          ${graph.vendorA}::uuid, ${graph.projectA}::uuid, ${graph.poA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      await db.execute(sql`
        UPDATE purchase_orders
        SET vendor_id = ${graph.vendorB}::uuid
        WHERE id = ${graph.poA}::uuid
      `);
      const po = resultRows<{ vendor_id: string }>(
        await db.execute(sql`
          SELECT vendor_id::text AS vendor_id FROM purchase_orders WHERE id = ${graph.poA}::uuid
        `),
      )[0];
      expect(po?.vendor_id).toBe(graph.vendorB);

      const stale = resultRows<{ n: string }>(
        await db.execute(sql`
          SELECT count(*)::text AS n FROM ocr_correction_memory
        `),
      );
      expect(stale[0]?.n).toBe('0');
    });
  });

  it('service_role can write trusted confirmation rows', async () => {
    const graph = await seedOrgGraph();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO ocr_correction_memory (
          organization_id, mapping_kind, source_key, vendor_id, last_confirmed_by_user_id
        ) VALUES (
          ${graph.orgId}::uuid, 'vendor', 'name:service', ${graph.vendorA}::uuid, ${graph.userA.id}::uuid
        )
      `);
      const rows = resultRows<{ n: string }>(
        await db.execute(sql`SELECT count(*)::text AS n FROM ocr_correction_memory`),
      );
      expect(rows[0]?.n).toBe('1');
    });
  });
});

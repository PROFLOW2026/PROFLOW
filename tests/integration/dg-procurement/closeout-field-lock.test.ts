import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createContractor, createProjectAs } from '@tests/setup/dg-fixtures';
import { provisionTwoTenants } from '../projects/setup';

/**
 * One case against the final 0167 closeout trigger.
 * An external contractor with ext.handover.submit may submit their handover item.
 * Requirement, waiver, and internal completion fields stay locked.
 */
describe('closeout external field lock (0167)', () => {
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

  it('lets the contractor submit their handover item and rejects management field changes', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Closeout lock');
    const contractor = await createContractor(database, {
      organizationId: orgId,
      projectId,
      label: 'handover',
      capabilities: ['ext.handover.submit', 'ext.project.view'],
    });

    const seeded = await database.asService(async (db) => {
      const closeout = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO subcontract_agreement_closeouts (
            organization_id, project_id, vendor_id, subcontract_agreement_id, status
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${contractor.vendorId}::uuid,
            ${contractor.agreementId}::uuid, 'open'
          )
          RETURNING id
        `),
      );
      const item = resultRows<{ id: string }>(
        await db.execute(sql`
          INSERT INTO subcontract_closeout_checklist_items (
            organization_id, project_id, closeout_id, item_kind, title, is_required, status, sort_order
          ) VALUES (
            ${orgId}::uuid, ${projectId}::uuid, ${closeout[0]!.id}::uuid,
            'as_built', 'As-built drawings', true, 'pending', 1
          )
          RETURNING id
        `),
      );
      return { closeoutId: closeout[0]!.id, itemId: item[0]!.id };
    });

    await database.asUser(contractor.authUser.id, async (tx) => {
      await tx.execute(sql`
        UPDATE subcontract_closeout_checklist_items
        SET status = 'submitted',
            notes = 'Drawings uploaded',
            completed_at = now(),
            completed_actor_type = 'external',
            completed_by_principal_id = ${contractor.principalId}::uuid
        WHERE id = ${seeded.itemId}::uuid
          AND organization_id = ${orgId}::uuid
      `);
    });

    const submitted = await database.asService(async (db) =>
      resultRows<{ status: string; notes: string; item_kind: string; title: string }>(
        await db.execute(sql`
          SELECT status, notes, item_kind, title
          FROM subcontract_closeout_checklist_items
          WHERE id = ${seeded.itemId}::uuid
        `),
      ),
    );
    expect(submitted[0]).toMatchObject({
      status: 'submitted',
      notes: 'Drawings uploaded',
      item_kind: 'as_built',
      title: 'As-built drawings',
    });

    const denied: Array<{ column: string; sql: ReturnType<typeof sql> }> = [
      { column: 'item_kind', sql: sql`item_kind = 'custom'` },
      { column: 'title', sql: sql`title = 'Changed by contractor'` },
      { column: 'is_required', sql: sql`is_required = false` },
      { column: 'sort_order', sql: sql`sort_order = 9` },
      { column: 'waive_reason', sql: sql`waive_reason = 'not needed'` },
      { column: 'waived_by_user_id', sql: sql`waived_by_user_id = ${userA.id}::uuid` },
      { column: 'waived_at', sql: sql`waived_at = now()` },
      { column: 'completed_by_user_id', sql: sql`completed_by_user_id = ${userA.id}::uuid` },
      { column: 'status', sql: sql`status = 'waived'` },
    ];

    const nested = (error: unknown): string => {
      let text = '';
      let current: unknown = error;
      for (let depth = 0; depth < 6 && current; depth += 1) {
        text += `${current}`;
        current = (current as { cause?: unknown }).cause;
      }
      return text.toLowerCase();
    };
    for (const change of denied) {
      await expect(
        database.asUser(contractor.authUser.id, (tx) =>
          tx.execute(sql`
            UPDATE subcontract_closeout_checklist_items
            SET ${change.sql}
            WHERE id = ${seeded.itemId}::uuid
              AND organization_id = ${orgId}::uuid
          `),
        ),
      ).rejects.toSatisfy((error: unknown) =>
        /closeout requirement fields are internal|closeout waiver is internal/.test(nested(error)),
      );
    }

    const locked = await database.asService(async (db) =>
      resultRows<{
        item_kind: string;
        title: string;
        is_required: boolean;
        sort_order: number;
        waive_reason: string | null;
        waived_by_user_id: string | null;
        waived_at: string | null;
        completed_by_user_id: string | null;
        status: string;
      }>(
        await db.execute(sql`
          SELECT item_kind, title, is_required, sort_order, waive_reason,
                 waived_by_user_id::text, waived_at::text, completed_by_user_id::text, status
          FROM subcontract_closeout_checklist_items
          WHERE id = ${seeded.itemId}::uuid
        `),
      ),
    );
    expect(locked[0]).toMatchObject({
      item_kind: 'as_built',
      title: 'As-built drawings',
      is_required: true,
      sort_order: 1,
      waive_reason: null,
      waived_by_user_id: null,
      waived_at: null,
      completed_by_user_id: null,
      status: 'submitted',
    });
  });
});

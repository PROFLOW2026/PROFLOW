import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { sql } from 'drizzle-orm';
import {
  buildLiveBrandSnapshot,
  captureBrandSnapshot,
  ensureDefaultBranding,
  resolveDocumentBrand,
  updateCompanyProfile,
} from '@/modules/branding';
import { createProject } from '@/modules/projects';
import { createQuote, transitionQuoteStatus } from '@/modules/quotes';
import {
  acceptInvitation,
  createInvitation,
  resolveOrgContext,
} from '@/modules/tenancy';
import { createVendor } from '@/modules/vendors';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../clients/setup';

function errorText(err: unknown): string {
  return [
    err instanceof Error ? err.message : String(err),
    err instanceof Error && err.cause instanceof Error ? err.cause.message : '',
    err instanceof Error && err.cause ? String(err.cause) : '',
  ].join('\n');
}

async function expectSqlDenied(
  database: TestDatabase,
  userId: string,
  run: (tx: Parameters<Parameters<TestDatabase['asUser']>[1]>[0]) => Promise<unknown>,
) {
  await expect(
    database.asUser(userId, async (tx) => {
      await run(tx);
    }),
  ).rejects.toSatisfy((err: unknown) =>
    /permission denied|missing permission|brand snapshot subject|project access denied|function.*does not exist|foreign key|23503|42501|42883|Failed query/i.test(
      errorText(err),
    ),
  );
}

async function onboardMember(
  database: TestDatabase,
  ownerId: string,
  organizationId: string,
  email: string,
  roleKey: 'worker' | 'finance' | 'manager',
) {
  const invitation = await database.asUser(ownerId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId: ownerId, organizationId, locale: 'en' });
    return createInvitation(context, { email, roleKey });
  });
  const user = await createTestUser(database, email);
  await database.asService((db) =>
    acceptInvitation(db, {
      token: invitation.token,
      userId: user.id,
      userEmail: user.email,
    }),
  );
  return user;
}

describe('0062 consolidated owner gate — snapshot auth + quote entity', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('Product Quote brand column is on estimates; commercial quotes remain separate', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const cols = resultRows<{ table_name: string }>(
        await tx.execute(sql`
          SELECT table_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND column_name = 'brand_profile_id'
            AND table_name IN ('estimates', 'quotes', 'projects', 'purchase_orders')
          ORDER BY table_name
        `),
      );
      expect(cols.map((c) => c.table_name)).toEqual([
        'estimates',
        'projects',
        'purchase_orders',
        'quotes',
      ]);

      const fks = resultRows<{ conname: string }>(
        await tx.execute(sql`
          SELECT conname FROM pg_constraint
          WHERE conname IN (
            'estimates_brand_profile_org_fk',
            'quotes_brand_profile_org_fk',
            'projects_brand_profile_org_fk',
            'purchase_orders_brand_profile_org_fk'
          )
          ORDER BY conname
        `),
      );
      expect(fks).toHaveLength(4);
    });

    const quoteId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });
      const quote = await createQuote(context, {
        title: 'Brand Override Quote',
        currency: 'ILS',
        lines: [{ description: 'Line', quantity: '1', unitPriceAmount: '10' }],
      });
      return quote.id;
    });

    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        UPDATE public.estimates
           SET brand_profile_id = ${crypto.randomUUID()}::uuid
         WHERE id = ${quoteId}::uuid
           AND organization_id = ${orgA.organization.id}::uuid
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const live = await buildLiveBrandSnapshot(context);
      await tx.execute(sql`
        UPDATE public.estimates
           SET brand_profile_id = ${live.brandProfileId}::uuid
         WHERE id = ${quoteId}::uuid
           AND organization_id = ${orgA.organization.id}::uuid
      `);
      const [row] = resultRows<{ brand_profile_id: string }>(
        await tx.execute(sql`
          SELECT brand_profile_id FROM public.estimates WHERE id = ${quoteId}::uuid
        `),
      );
      expect(row?.brand_profile_id).toBe(live.brandProfileId);
    });
  });

  it('BLOCKS subject_ok / helper EXECUTE for authenticated', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.document_brand_snapshot_subject_ok(
          ${orgA.organization.id}::uuid, 'quote', ${crypto.randomUUID()}::uuid
        )
      `);
    });
    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.build_canonical_brand_snapshot_json(
          ${orgA.organization.id}::uuid, NULL::uuid
        )
      `);
    });
  });

  it('BLOCKS ordinary member / poisoning / wrong-org; PASS authorized + immutable + canonical', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    const worker = await onboardMember(
      database,
      userA.id,
      orgA.organization.id,
      'gate-worker@example.test',
      'worker',
    );
    const finance = await onboardMember(
      database,
      userA.id,
      orgA.organization.id,
      'gate-finance@example.test',
      'finance',
    );

    const { quoteId, brandId } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });
      await updateCompanyProfile(context, {
        legalName: 'Canonical Co',
        displayName: 'Canonical Co',
      });
      const live = await buildLiveBrandSnapshot(context);
      const quote = await createQuote(context, {
        title: 'Gate Quote',
        currency: 'ILS',
        lines: [{ description: 'Line', quantity: '1', unitPriceAmount: '100' }],
      });
      await transitionQuoteStatus(context, { quoteId: quote.id, toStatus: 'sent' });
      return { quoteId: quote.id, brandId: live.brandProfileId };
    });

    const poison = JSON.stringify({
      version: 1,
      companyDisplayName: 'POISONED',
      companyLegalName: 'POISONED',
    });

    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid,
          'quote',
          ${quoteId}::uuid,
          ${brandId}::uuid,
          ${poison}::jsonb
        )
      `);
    });

    await expectSqlDenied(database, worker.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'quote', ${quoteId}::uuid, NULL::uuid
        )
      `);
    });

    await expectSqlDenied(database, finance.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'quote', ${quoteId}::uuid, NULL::uuid
        )
      `);
    });

    await expectSqlDenied(database, userB.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgB.organization.id}::uuid, 'quote', ${quoteId}::uuid, NULL::uuid
        )
      `);
    });

    await expectSqlDenied(database, userA.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid, 'quote', ${crypto.randomUUID()}::uuid, NULL::uuid
        )
      `);
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const resolved = await resolveDocumentBrand(context, {
        entityType: 'quote',
        entityId: quoteId,
        useSnapshotIfPresent: true,
        locale: 'en',
      });
      expect(resolved.source).toBe('snapshot');
      expect(resolved.snapshot.companyDisplayName).toBe('Canonical Co');
      expect(resolved.snapshot.companyDisplayName).not.toBe('POISONED');

      await updateCompanyProfile(context, {
        legalName: 'After Rename',
        displayName: 'After Rename',
      });
      const again = await captureBrandSnapshot(context, {
        entityType: 'quote',
        entityId: quoteId,
      });
      expect(again.snapshot.companyDisplayName).toBe('Canonical Co');
    });
  });

  it('BLOCKS restricted-project user freezing unrelated project entity', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const ids = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await ensureDefaultBranding(context.db, context.organizationId, {
        name: context.organization.name,
        countryCode: 'IL',
      });

      const projectA = await createProject(context, {
        name: 'Accessible',
      });
      const projectB = await createProject(context, {
        name: 'Restricted',
      });
      const vendor = await createVendor(context, {
        name: 'Vendor B',
      });

      const poB = crypto.randomUUID();
      await tx.execute(sql`
        INSERT INTO public.purchase_orders (
          id, organization_id, vendor_id, project_id, status, currency, committed_amount
        ) VALUES (
          ${poB}::uuid,
          ${orgA.organization.id}::uuid,
          ${vendor.id}::uuid,
          ${projectB.projectId}::uuid,
          'issued',
          'ILS',
          100
        )
      `);

      return { projectAId: projectA.projectId, poB };
    });

    const scoped = await createTestUser(database, 'scoped-brand@example.test');
    const roleId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO organization_settings (organization_id, key, value)
        VALUES (${orgA.organization.id}::uuid, 'project_access_mode', '"selected"'::jsonb)
        ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value
      `);
      await db.execute(sql`
        INSERT INTO organization_memberships (id, organization_id, user_id, status)
        VALUES (${membershipId}::uuid, ${orgA.organization.id}::uuid, ${scoped.id}::uuid, 'active')
      `);
      await db.execute(sql`
        INSERT INTO roles (id, organization_id, key, name, rank, is_protected)
        VALUES (${roleId}::uuid, ${orgA.organization.id}::uuid, 'scoped_brand', 'Scoped Brand', 50, false)
      `);
      // procurement.manage WITHOUT projects.access_all
      await db.execute(sql`
        INSERT INTO role_permissions (organization_id, role_id, permission_key)
        VALUES
          (${orgA.organization.id}::uuid, ${roleId}::uuid, 'procurement.manage'),
          (${orgA.organization.id}::uuid, ${roleId}::uuid, 'procurement.read'),
          (${orgA.organization.id}::uuid, ${roleId}::uuid, 'projects.read'),
          (${orgA.organization.id}::uuid, ${roleId}::uuid, 'org.read')
      `);
      await db.execute(sql`
        INSERT INTO role_assignments (organization_id, membership_id, user_id, role_id)
        VALUES (
          ${orgA.organization.id}::uuid,
          ${membershipId}::uuid,
          ${scoped.id}::uuid,
          ${roleId}::uuid
        )
      `);
      await db.execute(sql`
        INSERT INTO project_access_grants (organization_id, user_id, project_id, access_level)
        VALUES (
          ${orgA.organization.id}::uuid,
          ${scoped.id}::uuid,
          ${ids.projectAId}::uuid,
          'read'
        )
      `);
    });

    await expectSqlDenied(database, scoped.id, async (tx) => {
      await tx.execute(sql`
        SELECT app.freeze_document_brand_snapshot(
          ${orgA.organization.id}::uuid,
          'purchase_order',
          ${ids.poB}::uuid,
          NULL::uuid
        )
      `);
    });
  });

  it('maps BOQ progress batch + warranty issue entity types in CHECK', async () => {
    await database.asService(async (db) => {
      const rows = resultRows<{ def: string }>(
        await db.execute(sql`
          SELECT pg_get_constraintdef(oid) AS def
          FROM pg_constraint
          WHERE conname = 'document_brand_snapshots_entity_type_known'
        `),
      );
      const def = rows[0]?.def ?? '';
      expect(def).toMatch(/boq_progress_batch/);
      expect(def).toMatch(/warranty_issue/);
    });
  });
});

/**
 * Migration 0178 — narrows app.external_principals_identity_immutable() vs 0156:
 * still blocks principal_kind, auth_user_id, home_organization_id for contractors;
 * allows username_normalized + email updates (app syncs Supabase auth email first).
 */
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createProjectAs } from '@tests/setup/dg-fixtures';
import { createContractorAccount } from '@tests/setup/dg-fixtures-external';
import { provisionTwoTenants } from '../projects/setup';

function functionBody(source: string, fnName: string): string {
  const marker = `FUNCTION app.${fnName}()`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const fnStart = source.indexOf('$fn$', start);
  const fnEnd = source.indexOf('$fn$', fnStart + 4);
  return source.slice(fnStart + 4, fnEnd);
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const TAG_0156 = '0156_dg_external_identity';
const TAG_0178 = '0178_contractor_username_org_update';

function expectPgError(error: unknown, fragment: string) {
  const blob = error instanceof Error ? `${error.message}\n${String(error.cause ?? '')}` : String(error);
  expect(blob).toContain(fragment);
}

describe('0178 contractor username trigger (disposable PGlite)', () => {
  it('SQL: replaces 0156 function — drops username/email from immutability guard', async () => {
    const before = await readFile(path.join(MIGRATIONS_DIR, `${TAG_0156}.sql`), 'utf8');
    const after = await readFile(path.join(MIGRATIONS_DIR, `${TAG_0178}.sql`), 'utf8');
    const bodyBefore = functionBody(before, 'external_principals_identity_immutable');
    const bodyAfter = functionBody(after, 'external_principals_identity_immutable');
    expect(bodyBefore).toContain('NEW.username_normalized IS DISTINCT FROM OLD.username_normalized');
    expect(bodyBefore).toContain('NEW.email IS DISTINCT FROM OLD.email');
    expect(bodyAfter).not.toContain('username_normalized');
    expect(bodyAfter).not.toContain('NEW.email IS DISTINCT FROM OLD.email');
    expect(bodyAfter).toContain('NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id');
    expect(bodyAfter).toContain('NEW.home_organization_id IS DISTINCT FROM OLD.home_organization_id');
    expect(bodyAfter).toContain('NEW.principal_kind IS DISTINCT FROM OLD.principal_kind');
  });

  describe('trigger behavior after full migration chain', () => {
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

    async function contractorRow(label: string, username: string) {
      const { orgA, userA } = await provisionTwoTenants(database);
      const projectId = await createProjectAs(database, userA.id, orgA.organization.id, label);
      return createContractorAccount(database, {
        organizationId: orgA.organization.id,
        projectId,
        label,
        username,
        withAgreement: false,
      });
    }

    it('contractor: blocks auth_user_id, home_organization_id, principal_kind changes', async () => {
      const account = await contractorRow('trigger-guard', 'guard.user');

      await expect(
        database.asService((db) =>
          db.execute(sql`
            UPDATE external_principals
            SET auth_user_id = ${randomUUID()}::uuid
            WHERE id = ${account.principalId}::uuid
          `),
        ),
      ).rejects.toSatisfy((e) => {
        expectPgError(e, 'external contractor identity is immutable');
        return true;
      });

      await expect(
        database.asService((db) =>
          db.execute(sql`
            UPDATE external_principals
            SET home_organization_id = ${randomUUID()}::uuid
            WHERE id = ${account.principalId}::uuid
          `),
        ),
      ).rejects.toSatisfy((e) => {
        expectPgError(e, 'external contractor identity is immutable');
        return true;
      });

      await expect(
        database.asService((db) =>
          db.execute(sql`
            UPDATE external_principals
            SET principal_kind = 'portal'
            WHERE id = ${account.principalId}::uuid
          `),
        ),
      ).rejects.toSatisfy((e) => {
        expectPgError(e, 'external contractor identity is immutable');
        return true;
      });
    });

    it('contractor: allows username_normalized and email updates (0178 intent)', async () => {
      const account = await contractorRow('trigger-allow', 'allow.user');
      const nextEmail = 'allow.user.new@contractors.projectflow.invalid';

      await database.asService((db) =>
        db.execute(sql`
          UPDATE external_principals
          SET
            username = 'allow.user.new',
            username_normalized = 'allow.user.new',
            email = ${nextEmail}
          WHERE id = ${account.principalId}::uuid
        `),
      );

      const [row] = await database.asService((db) =>
        db.execute(sql`
          SELECT username_normalized, email
          FROM external_principals
          WHERE id = ${account.principalId}::uuid
        `),
      ).then((r) => resultRows<{ username_normalized: string; email: string }>(r));

      expect(row).toMatchObject({ username_normalized: 'allow.user.new', email: nextEmail });
    });

    it('portal principals: email updates remain allowed (non-contractor branch)', async () => {
      const portalId = randomUUID();

      await database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO external_principals (
            id, principal_kind, email, status
          ) VALUES (
            ${portalId}::uuid, 'portal', 'portal@example.test', 'active'
          )
        `);
      });

      await database.asService((db) =>
        db.execute(sql`
          UPDATE external_principals SET email = 'portal2@example.test' WHERE id = ${portalId}::uuid
        `),
      );

      const [row] = await database.asService((db) =>
        db.execute(sql`
          SELECT email FROM external_principals WHERE id = ${portalId}::uuid
        `),
      ).then((r) => resultRows<{ email: string }>(r));
      expect(row?.email).toBe('portal2@example.test');
    });
  });
});

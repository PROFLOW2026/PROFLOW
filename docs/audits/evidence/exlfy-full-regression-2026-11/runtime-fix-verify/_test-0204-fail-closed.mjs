/**
 * Isolated validation of 0204 fail-closed migration (local projectflow_e2e only).
 * Never touches Supabase / Production.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const LOCAL_URL = 'postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e';
const sqlFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../drizzle/migrations/0204_tasks_work_package_composite_fk.sql',
);

const migrationSql = readFileSync(sqlFile, 'utf8');

if (/UPDATE\s+public\.tasks/i.test(migrationSql)) {
  console.error('FAIL: migration still contains UPDATE public.tasks');
  process.exit(1);
}

const sql = postgres(LOCAL_URL, { max: 1, prepare: false, onnotice: () => {} });

function assertLocal(identity) {
  if (identity.addr !== '127.0.0.1/32' && identity.addr !== '::1/128') {
    throw new Error(`Refusing non-local DB addr=${identity.addr}`);
  }
  if (identity.db !== 'projectflow_e2e') {
    throw new Error(`Refusing db=${identity.db}`);
  }
}

async function constraintExists(client, name) {
  const rows = await client`
    SELECT 1 FROM pg_constraint WHERE conname = ${name} LIMIT 1
  `;
  return rows.length > 0;
}

async function main() {
  const [identity] = await sql`
    SELECT inet_client_addr()::text AS addr, current_database() AS db
  `;
  assertLocal(identity);
  console.log(`OK local identity db=${identity.db} addr=${identity.addr}`);

  // --- Scenario A: idempotent re-apply on current (compatible) schema ---
  await sql.begin(async (tx) => {
    await tx.unsafe(migrationSql);
  });
  console.log('PASS A: idempotent apply on compatible DB');

  const hasNew = await constraintExists(sql, 'tasks_work_package_org_project_fk');
  const hasOld = await constraintExists(sql, 'tasks_work_package_id_work_packages_id_fk');
  const hasCheck = await constraintExists(sql, 'tasks_work_package_requires_project');
  if (!hasNew || hasOld || !hasCheck) {
    throw new Error(`Unexpected constraints after A: new=${hasNew} old=${hasOld} check=${hasCheck}`);
  }

  // --- Scenario B: incompatible row must abort; no unlink; no partial FK ---
  await sql.begin(async (tx) => {
    if (await constraintExists(tx, 'tasks_work_package_org_project_fk')) {
      await tx.unsafe(`ALTER TABLE public.tasks DROP CONSTRAINT tasks_work_package_org_project_fk`);
    }
    if (await constraintExists(tx, 'tasks_work_package_requires_project')) {
      await tx.unsafe(`ALTER TABLE public.tasks DROP CONSTRAINT tasks_work_package_requires_project`);
    }
    if (!(await constraintExists(tx, 'tasks_work_package_id_work_packages_id_fk'))) {
      await tx.unsafe(`
        ALTER TABLE public.tasks
          ADD CONSTRAINT tasks_work_package_id_work_packages_id_fk
          FOREIGN KEY (work_package_id)
          REFERENCES public.work_packages (id)
          ON DELETE SET NULL
      `);
    }

    const [wp] = await tx`
      SELECT id, organization_id, project_id
      FROM public.work_packages
      WHERE project_id IS NOT NULL
      LIMIT 1
    `;
    if (!wp) throw new Error('No work_package with project in projectflow_e2e');

    const [task] = await tx`
      SELECT id, work_package_id, project_id
      FROM public.tasks
      WHERE organization_id = ${wp.organization_id}
        AND project_id IS NOT NULL
        AND project_id <> ${wp.project_id}
      LIMIT 1
    `;

    let taskId;
    if (task) {
      taskId = task.id;
      await tx`UPDATE public.tasks SET work_package_id = ${wp.id} WHERE id = ${taskId}`;
    } else {
      const [anyTask] = await tx`
        SELECT id FROM public.tasks
        WHERE organization_id = ${wp.organization_id}
        LIMIT 1
      `;
      if (!anyTask) throw new Error('No task to plant bad attribution');
      taskId = anyTask.id;
      await tx`
        UPDATE public.tasks
        SET work_package_id = ${wp.id}, project_id = NULL
        WHERE id = ${taskId}
      `;
    }

    const [before] = await tx`
      SELECT work_package_id::text AS work_package_id
      FROM public.tasks WHERE id = ${taskId}
    `;

    await tx.unsafe('SAVEPOINT before_0204');

    let message = '';
    try {
      await tx.unsafe(migrationSql);
      throw new Error('Expected migration to abort on incompatible rows');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      if (message.includes('Expected migration to abort')) throw error;
      await tx.unsafe('ROLLBACK TO SAVEPOINT before_0204');
    }

    if (!message.includes('0204_tasks_work_package_composite_fk aborted')) {
      throw new Error(`Unexpected error message: ${message}`);
    }

    const [after] = await tx`
      SELECT work_package_id::text AS work_package_id
      FROM public.tasks WHERE id = ${taskId}
    `;
    if (after.work_package_id !== before.work_package_id) {
      throw new Error('Migration mutated work_package_id on failure path');
    }
    if (await constraintExists(tx, 'tasks_work_package_org_project_fk')) {
      throw new Error('Composite FK present after failed migration (partial apply)');
    }

    console.log('PASS B: abort on bad rows; work_package_id preserved; no composite FK');
    console.log(`  error: ${message.slice(0, 220)}`);

    // Discard planted bad row + peeled constraints by aborting this transaction.
    throw Object.assign(new Error('ROLLBACK_SCENARIO_B'), { code: 'ROLLBACK_SCENARIO_B' });
  }).catch((error) => {
    const text = String(error?.message || error);
    if (error?.code === 'ROLLBACK_SCENARIO_B' || text.includes('ROLLBACK_SCENARIO_B')) {
      return;
    }
    throw error;
  });

  // Outer state should still be the pre-B good schema (transaction B rolled back).
  if (!(await constraintExists(sql, 'tasks_work_package_org_project_fk'))) {
    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSql);
    });
  }
  console.log('PASS C: DB restored with composite FK after scenario B rollback');

  console.log('ALL 0204 fail-closed checks PASS (local projectflow_e2e only)');
}

main()
  .catch((error) => {
    console.error('TEST_FAIL', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
  });

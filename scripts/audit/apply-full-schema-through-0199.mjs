import fs from "node:fs";
import postgres from "postgres";

const url = process.env.REMEDIATION_POSTGRES_URL ?? "";
if (!url) throw new Error("REMEDIATION_POSTGRES_URL is required");
const parsed = new URL(url);
const port = Number(parsed.port);
if (parsed.hostname !== "127.0.0.1" || port < 56000 || port === 55432 || port === 55433) {
  throw new Error("refusing non-isolated database");
}

const journal = JSON.parse(fs.readFileSync("drizzle/migrations/meta/_journal.json", "utf8"));
const tags = journal.entries.map((entry) => entry.tag);
const expectedTail = [
  "0196_infra_capture_level_and_grant_locations",
  "0197_employee_notification_access",
  "0198_owner_closed_period_source_edit",
  "0199_duplicate_warnings_and_auth_rate_limits",
];
if (tags.slice(-4).join("|") !== expectedTail.join("|")) {
  throw new Error("journal tail is " + tags.slice(-4).join(", "));
}

function stripDollarBodies(sqlText) {
  const withoutBodies = sqlText.replace(/\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, "");
  return withoutBodies.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

for (const tag of expectedTail.slice(1)) {
  const outside = stripDollarBodies(fs.readFileSync(`drizzle/migrations/${tag}.sql`, "utf8"));
  const hit = outside.match(/^\s*(UPDATE|DELETE|TRUNCATE|INSERT)\b/im);
  if (hit) throw new Error(tag + " has a top-level " + hit[1]);
}
console.log("PASS no top-level data change in 0197-0199");

const sql = postgres(url, { max: 1, onnotice: () => {} });

async function apply(tag) {
  const file = `drizzle/migrations/${tag}.sql`;
  try {
    await sql.file(file);
  } catch (error) {
    console.error("FAILED", tag);
    throw error;
  }
  console.log("APPLIED", tag);
}

function quoteIdent(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("unexpected table " + name);
  return name;
}

async function counts() {
  const tables = await sql`
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY 1
  `;
  const out = {};
  for (const table of tables) {
    const name = quoteIdent(table.name);
    const [row] = await sql.unsafe(`SELECT count(*)::int AS n FROM public.${name}`);
    out[name] = row.n;
  }
  return out;
}

try {
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await sql.unsafe("CREATE SCHEMA public");
  await sql.unsafe("DROP SCHEMA IF EXISTS app CASCADE");
  await sql.unsafe("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await sql.unsafe("DROP SCHEMA IF EXISTS auth CASCADE");
  await sql.unsafe("CREATE SCHEMA auth");
  await sql.unsafe("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'");
  for (const tag of tags) {
    if (tag >= "0197_") break;
    await apply(tag);
  }
  const before = await counts();
  const markerId = "01990000-0000-4000-8000-000000000197";
  await sql`
    INSERT INTO public.organizations (id, name)
    VALUES (${markerId}::uuid, 'remediation-marker')
  `;
  const [beforeOrg] = await sql`
    SELECT id::text AS id, name
    FROM public.organizations
    WHERE id = ${markerId}::uuid
  `;
  if (!beforeOrg) throw new Error("marker organization was not stored");

  for (const tag of expectedTail.slice(1)) await apply(tag);

  const after = await counts();
  for (const [name, count] of Object.entries(before)) {
    if (after[name] !== count && !(name === "organizations" && after[name] === count + 1)) {
      throw new Error(`row count changed for ${name}: ${count} -> ${after[name]}`);
    }
  }
  if (after.organizations !== before.organizations + 1) {
    throw new Error("organization count changed beyond the marker");
  }
  const [afterOrg] = await sql`
    SELECT id::text AS id, name
    FROM public.organizations
    WHERE id = ${markerId}::uuid
  `;
  if (JSON.stringify(afterOrg) !== JSON.stringify(beforeOrg)) {
    throw new Error("marker organization changed: " + JSON.stringify(afterOrg));
  }
  console.log("PASS existing rows unchanged");

  const functions = [
    "app.is_organization_owner(uuid)",
    "app.mark_linked_opportunity_won(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz)",
    "app.external_principal_display_name(uuid)",
    "app.consume_auth_rate_limit(text,text,integer,integer)",
  ];
  for (const signature of functions) {
    const [row] = await sql`SELECT to_regprocedure(${signature}) AS proc`;
    if (!row.proc) throw new Error("missing function " + signature);
  }
  const [guard] = await sql`
    SELECT pg_get_functiondef('app.closed_period_rewrite_guard()'::regprocedure) AS def
  `;
  if (!guard.def.includes("app.is_organization_owner")) {
    throw new Error("closed period guard has no owner exception");
  }
  console.log("PASS functions");

  const policies = await sql`
    SELECT polname,
           pg_get_expr(polqual, polrelid) AS using_expr,
           pg_get_expr(polwithcheck, polrelid) AS check_expr
    FROM pg_policy
    WHERE polrelid = 'public.duplicate_warning_acknowledgements'::regclass
    ORDER BY polname
  `;
  const ack = policies.find((policy) => policy.polname === "duplicate_warning_acknowledgements_ack");
  if (!ack) throw new Error("ack policy missing");
  if (!ack.using_expr.includes("status = 'pending'::text") && !ack.using_expr.includes("status = 'pending'")) {
    throw new Error("ack USING is " + ack.using_expr);
  }
  if (ack.using_expr.includes("acknowledged")) throw new Error("ack USING still matches acknowledged rows");
  if (!ack.check_expr.includes("app.current_user_id()")) {
    throw new Error("ack CHECK missing current user");
  }
  console.log("PASS acknowledgement policy");

  const triggers = await sql`
    SELECT tgname, tgrelid::regclass::text AS table_name, tgenabled
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND (
        pg_get_triggerdef(oid) ILIKE '%closed_period%'
        OR pg_get_triggerdef(oid) ILIKE '%payment_lifecycle_guard%'
        OR pg_get_triggerdef(oid) ILIKE '%economic_immutability%'
      )
  `;
  if (triggers.length === 0) throw new Error("closed-period triggers missing");
  const disabled = triggers.filter((trigger) => trigger.tgenabled !== "O");
  if (disabled.length) throw new Error("disabled triggers " + JSON.stringify(disabled));
  console.log("PASS triggers", triggers.length);

  const warnings = await sql`SELECT count(*)::int AS n FROM public.duplicate_warning_acknowledgements`;
  const limits = await sql`SELECT count(*)::int AS n FROM public.auth_rate_limits`;
  if (warnings[0].n !== 0 || limits[0].n !== 0) throw new Error("new tables are not empty");
  console.log("PASS new tables empty");
  console.log("SCHEMA READY");
} finally {
  await sql.end();
}

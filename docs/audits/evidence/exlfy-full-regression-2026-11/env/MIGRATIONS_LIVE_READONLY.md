# Live DB migrations — read-only verification (2026-11-14 wave 2)

**Target:** Supabase project `PROFLOW` / `rnjeggpsjchayprygkcw` / region `eu-west-1`  
**Method:** Supabase MCP `execute_sql` SELECT / catalog only. **No DDL. No apply_migration.**  
**Assumption:** This is the sole ACTIVE PROFLOW project visible to the authenticated MCP account (treated as Production DB for audit).

## drizzle.__drizzle_migrations (latest 7 by created_at)

| id | created_at (ms) | Matches journal `when` for |
|----|-----------------|----------------------------|
| 212 | 1794266401000 | `0203_tasks_work_package_id` (201) |
| 211 | 1794266400000 | `0202_automation_task_scan_presets` (200) |
| 210 | 1794180001000 | `0201_planning_baselines_project_goals` (199) |
| 209 | 1794180000000 | `0200_exlfy_evolution_local` (198) |
| 208 | 1794102402000 | `0199_duplicate_warnings_and_auth_rate_limits` (197) |
| 207 | 1794102401000 | `0198_owner_closed_period_source_edit` (196) |
| 206 | 1794102400000 | `0197_employee_notification_access` (195) |

Hash→filename mapping via meta JSON was empty (Drizzle content hashes ≠ filename); **timestamp alignment with journal `when` is the primary match.**

`list_migrations` MCP returned `[]` (tool tracks a different migration ledger) — **not** used as evidence of missing SQL.

## Schema object probes

| Object | Result |
|--------|--------|
| `drawing_sheet_marks` | present |
| `project_risks` | present |
| `work_permits` | present |
| `supplier_rfq_access_tokens` | present |
| `planning_schedule_baselines` / `_snapshots` | present |
| `project_goals` | present |
| `tasks.work_package_id` | **true** |
| `employee_month_costs` | present |
| `automation_rules_preset_known` includes `task_blocked` / `task_reminder_due` | **verified in follow-up query** (see run log) |

## Classification impact on BUG-006

| Prior | Updated |
|-------|---------|
| CONDITIONAL P0 — deploy-before-migrate **unverified** | **WEAKENED** — live schema + journal timestamps indicate **0197–0203 applied** on this DB |

**Still not proven:** Active Vercel Production **code SHA** equals local `b2f0b9e7` (Vercel team consent still required). Schema-applied ≠ frontend deployed.

**Residual risks:** Partial apply edge cases; objects created outside drizzle journal; RLS policy drift — not fully diffed in this wave.

## Evidence files

- This file
- Raw SQL results captured via MCP (agent session)
- Prior static audit: `db/SCHEMA_MIGRATION_0200-0203_READ_ONLY_AUDIT.md`

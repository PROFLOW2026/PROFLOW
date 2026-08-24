import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');
const SQL69_PATH = path.join(MIGRATIONS_DIR, '0069_true_cost_profitability.sql');

const YEAR_MONTH_01_12 = /\(0\[1-9\]\|1\[0-2\]\)/;

async function load0069Sql(): Promise<string> {
  return readFile(SQL69_PATH, 'utf8');
}

/** Extract a CREATE OR REPLACE FUNCTION body by name (Owner-final guard tests). */
function extractFunctionBody(sql: string, functionName: string): string {
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION app\\.${functionName}\\(\\)[\\s\\S]*?\\$\\$;`,
    ),
  );
  expect(match, `expected app.${functionName} in 0069 SQL`).toBeTruthy();
  return match![0];
}

describe('0069 true cost SQL guards (Owner revision)', () => {
  it('validates year_month as YYYY-01..12 on schedule, general pool, and occurrence', async () => {
    const sql = await load0069Sql();

    const scheduleBlocks = sql.match(
      /expense_managerial_schedule_lines[\s\S]*?year_month_shape[\s\S]*?CHECK \(year_month ~ '\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$'\)/g,
    );
    expect(scheduleBlocks?.length).toBeGreaterThanOrEqual(1);

    expect(sql).toMatch(
      /general_cost_months_year_month_shape[\s\S]*CHECK \(year_month ~ '\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$'\)/,
    );
    expect(sql).toMatch(
      /recurring_financial_draft_runs_occurrence_ym_shape[\s\S]*occurrence_year_month ~ '\^\[0-9\]\{4\}-\(0\[1-9\]\|1\[0-2\]\)\$'/,
    );
    expect(sql.match(new RegExp(YEAR_MONTH_01_12.source, 'g'))?.length).toBeGreaterThanOrEqual(3);
  });

  it('defines source_key uniqueness for recompute idempotency', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('general_cost_month_sources_month_key_uq');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS general_cost_month_sources_month_key_uq[\s\S]*\(general_cost_month_id, source_key\)/,
    );
  });

  it('defines frozen-month immutability guard and triggers', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('app.general_cost_month_frozen_guard');
    expect(sql).toContain('general_cost_months_frozen_guard');
    expect(sql).toContain('general_cost_month_allocations_frozen_guard');
    expect(sql).toContain('general_cost_month_sources_frozen_guard');
  });

  it('defines recurring amount-version non-overlap trigger', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('app.recurring_draft_amount_versions_assert_no_overlap');
    expect(sql).toMatch(
      /CREATE TRIGGER recurring_draft_amount_versions_no_overlap[\s\S]*EXECUTE FUNCTION app\.recurring_draft_amount_versions_assert_no_overlap\(\)/,
    );
  });

  it('defines child currency guard on allocations and sources', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('app.general_cost_child_currency_guard');
    expect(sql).toContain('general_cost_month_allocations_currency_guard');
    expect(sql).toContain('general_cost_month_sources_currency_guard');
  });

  it('revokes authenticated writes on derived general_cost_months, inventory_cost_layers, and recurring amount versions', async () => {
    const sql = await load0069Sql();
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.general_cost_months FROM authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.inventory_cost_layers FROM authenticated/,
    );
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.recurring_draft_amount_versions FROM authenticated/,
    );
    expect(sql).toMatch(
      /GRANT SELECT ON public\.recurring_draft_amount_versions TO authenticated/,
    );
  });

  it('defines recurring amount-version history immutability guard (close-only UPDATE, no DELETE)', async () => {
    const sql = await load0069Sql();
    const guard = extractFunctionBody(sql, 'recurring_draft_amount_versions_history_guard');
    expect(guard).toMatch(/TG_OP = 'DELETE'/);
    expect(guard).toMatch(/recurring_draft_amount_versions_history_immutable/);
    expect(guard).toMatch(/OLD\.valid_to IS NULL[\s\S]*NEW\.valid_to IS NOT NULL/);
    expect(guard).toMatch(/NEW\.amount IS NOT DISTINCT FROM OLD\.amount/);
    expect(sql).toMatch(
      /CREATE TRIGGER recurring_draft_amount_versions_history_guard[\s\S]*BEFORE UPDATE OR DELETE[\s\S]*EXECUTE FUNCTION app\.recurring_draft_amount_versions_history_guard\(\)/,
    );
  });

  it('requires inventory layer source_kind shape (expense, opening_balance; ap_bill disabled)', async () => {
    const sql = await load0069Sql();
    const shapeBlocks = sql.match(
      /ADD CONSTRAINT inventory_cost_layers_source_shape[\s\S]*?CHECK \([\s\S]*?\);/g,
    );
    expect(shapeBlocks?.length).toBeGreaterThanOrEqual(1);
    const combined = shapeBlocks!.join('\n');
    expect(combined).toMatch(/source_kind = 'expense'[\s\S]*source_expense_id IS NOT NULL/);
    expect(combined).toMatch(/source_kind = 'opening_balance'[\s\S]*opening_reference IS NOT NULL/);
    expect(combined).not.toMatch(/source_kind = 'ap_bill'/);
    expect(sql).toContain('inventory_cost_layers_opening_reference_uq');
    expect(sql).toMatch(/DROP INDEX IF EXISTS inventory_cost_layers_source_ap_bill_uq/);
  });

  it('requires inventory layer XOR source shape (expense vs AP) — superseded by source_kind CHECK', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('source_kind');
    expect(sql).toContain('opening_reference');
  });

  it('defines asset acquisition_shape CHECK and RESTRICT (not SET NULL) source FKs', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('assets_acquisition_shape');
    expect(sql).toMatch(/assets_source_expense_org_fk[\s\S]*ON DELETE RESTRICT/);
    expect(sql).toMatch(/assets_source_ap_bill_org_fk[\s\S]*ON DELETE RESTRICT/);
    expect(sql).not.toMatch(/assets_source_expense_org_fk[\s\S]*ON DELETE SET NULL/);
    expect(sql).not.toMatch(/assets_source_ap_bill_org_fk[\s\S]*ON DELETE SET NULL/);
  });

  it('uses signed general pool: conservation only, no pool_amount >= 0 clamp', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('general_cost_months_conservation');
    expect(sql).toMatch(
      /general_cost_months_conservation[\s\S]*allocated_amount \+ unallocatable_amount[\s\S]*pool_amount/,
    );
    expect(sql).not.toMatch(/pool_amount\s*>=\s*0/);
    expect(sql).not.toMatch(
      /ADD CONSTRAINT\s+general_cost_months_amounts_non_negative/i,
    );
  });

  it('documents Model A: closed never reopen; frozen general-cost stays frozen', async () => {
    const sql = await load0069Sql();
    expect(sql).toMatch(/Model A/i);
    expect(sql).toMatch(/closed[\s\S]{0,80}never reopen|never reopen[\s\S]{0,80}closed/i);
    expect(sql).toMatch(/frozen[\s\S]{0,120}stays frozen|frozen[\s\S]{0,80}forever|frozen→open is blocked/i);

    const frozenGuard = extractFunctionBody(sql, 'general_cost_month_frozen_guard');
    expect(frozenGuard).toMatch(/frozen→open is blocked|NEW\.status IS DISTINCT FROM OLD\.status/);
  });

  it('expense_managerial_schedule_closed_guard blocks all closed-period mutations (no recognized→void carve-out)', async () => {
    const sql = await load0069Sql();
    const guard = extractFunctionBody(sql, 'expense_managerial_schedule_closed_guard');

    // Owner-final: closed month is immutable — no recognized→void exception path.
    expect(guard).not.toMatch(
      /OLD\.status\s*=\s*'recognized'[\s\S]{0,200}NEW\.status\s*=\s*'void'/,
    );
    expect(guard).not.toMatch(/Allow void of recognized in closed month/i);
    expect(guard).toMatch(/closed_period_immutable/);
  });

  it('defines inventory layer composite uniqueness on (id, organization_id, inventory_item_id)', async () => {
    const sql = await load0069Sql();
    expect(sql).toMatch(
      /inventory_cost_layers_id_org_item_uq|CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_layers_id_org_item_uq[\s\S]*\(id,\s*organization_id,\s*inventory_item_id\)/,
    );
  });

  it('consumption layer FK includes inventory_item_id for same-item integrity', async () => {
    const sql = await load0069Sql();
    expect(sql).toMatch(
      /inventory_cost_consumptions_layer_org_fk[\s\S]*FOREIGN KEY \(inventory_cost_layer_id,\s*organization_id,\s*inventory_item_id\)[\s\S]*REFERENCES public\.inventory_cost_layers\(id,\s*organization_id,\s*inventory_item_id\)/,
    );
  });

  it('defines consumption idempotency unique indexes for movement and material usage', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('inventory_cost_consumptions_movement_layer_uq');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_consumptions_movement_layer_uq[\s\S]*\(organization_id,\s*movement_id,\s*inventory_cost_layer_id\)/,
    );
    expect(sql).toContain('inventory_cost_consumptions_material_layer_uq');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_consumptions_material_layer_uq[\s\S]*\(organization_id,\s*material_usage_id,\s*inventory_cost_layer_id\)/,
    );
  });

  it('recurring amount versions use advisory lock and gist exclusion (btree_gist)', async () => {
    const sql = await load0069Sql();
    const overlapFn = extractFunctionBody(
      sql,
      'recurring_draft_amount_versions_assert_no_overlap',
    );
    expect(overlapFn).toMatch(/pg_advisory_xact_lock\s*\(/);
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS btree_gist|btree_gist unavailable/);
    expect(sql).toMatch(/EXCLUDE USING gist[\s\S]*recurring_draft_amount_versions/);
  });

  it('general_cost_months id+org+currency uniqueness and child FKs include currency', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('general_cost_months_id_org_currency_uq');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS general_cost_months_id_org_currency_uq[\s\S]*\(id,\s*organization_id,\s*currency\)/,
    );
    expect(sql).toMatch(
      /general_cost_month_allocations_month_org_fk[\s\S]*FOREIGN KEY \(general_cost_month_id,\s*organization_id,\s*currency\)[\s\S]*REFERENCES public\.general_cost_months\(id,\s*organization_id,\s*currency\)/,
    );
    expect(sql).toMatch(
      /general_cost_month_sources_month_org_fk[\s\S]*FOREIGN KEY \(general_cost_month_id,\s*organization_id,\s*currency\)[\s\S]*REFERENCES public\.general_cost_months\(id,\s*organization_id,\s*currency\)/,
    );
  });

  it('inventory consumption idempotency is enforced at DB layer (no app idempotency keys)', async () => {
    const sql = await load0069Sql();
    // Domain has FIFO helpers only; duplicate movement/material rows must be blocked by SQL.
    expect(sql).toContain('inventory_cost_consumptions_movement_layer_uq');
    expect(sql).toContain('inventory_cost_consumptions_material_layer_uq');
    expect(sql).toMatch(/inventory_cost_layers_source_expense_uq/);
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS inventory_cost_layers_source_ap_bill_uq/);
  });

  it('defines inventory_items cost_basis trusted-write latch and guard trigger', async () => {
    const sql = await load0069Sql();
    const guard = extractFunctionBody(sql, 'inventory_items_cost_basis_guard');

    expect(guard).toMatch(/next_gen_latch_held\('inventory_cost_basis'\)/);
    expect(guard).not.toMatch(/inventory_cost_basis_write/);
    expect(guard).toMatch(/inventory_items_cost_basis_trusted_write_required/);
    // INSERT always zeros basis (trusted or not) — no invented initial stock value
    expect(guard).toMatch(/TG_OP = 'INSERT'[\s\S]*NEW\.cost_basis_amount := 0/);
    expect(guard).toMatch(/TG_OP = 'INSERT'[\s\S]*NEW\.cost_basis_currency := NULL/);
    expect(guard).not.toMatch(
      /TG_OP = 'INSERT'[\s\S]*IF NOT v_trusted[\s\S]*NEW\.cost_basis_amount := 0/,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER inventory_items_cost_basis_guard[\s\S]*BEFORE INSERT OR UPDATE[\s\S]*EXECUTE FUNCTION app\.inventory_items_cost_basis_guard\(\)/,
    );
  });

  it('defines cost_basis CHECK constraints (non-negative amount; currency required when positive)', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('inventory_items_cost_basis_non_negative');
    expect(sql).toMatch(
      /inventory_items_cost_basis_non_negative[\s\S]*CHECK \(cost_basis_amount >= 0\)/,
    );
    expect(sql).toContain('inventory_items_cost_basis_currency_shape');
    expect(sql).toMatch(
      /inventory_items_cost_basis_currency_shape[\s\S]*CHECK \(cost_basis_amount = 0 OR cost_basis_currency IS NOT NULL\)/,
    );
    expect(sql).toMatch(/Zero amount may have NULL currency; positive amount requires currency/i);
  });

  it('defines cost_basis layer reconciliation on trusted write (AFTER UPDATE)', async () => {
    const sql = await load0069Sql();
    const reconcile = extractFunctionBody(sql, 'inventory_items_cost_basis_reconcile');

    expect(reconcile).toMatch(/next_gen_latch_held\('inventory_cost_basis'\)/);
    expect(reconcile).not.toMatch(/inventory_cost_basis_write/);
    expect(reconcile).toMatch(/inventory_items_cost_basis_layer_mismatch/);
    expect(reconcile).toMatch(/sum\(l\.remaining_qty \* l\.unit_cost\)/);
    expect(reconcile).toMatch(/abs\(NEW\.cost_basis_amount - v_layer_sum\) >= 0\.000001/);
    expect(reconcile).toMatch(/inventory_items_cost_basis_currency_mismatch/);
    expect(reconcile).not.toMatch(/AND upper\(l\.currency\) = upper\(NEW\.cost_basis_currency\)/);
    // Zero basis must also reconcile — no early RETURN when amount = 0
    expect(reconcile).not.toMatch(
      /IF NEW\.cost_basis_amount = 0 THEN\s*RETURN NEW;/,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER inventory_items_cost_basis_reconcile[\s\S]*AFTER UPDATE OF cost_basis_amount, cost_basis_currency[\s\S]*EXECUTE FUNCTION app\.inventory_items_cost_basis_reconcile\(\)/,
    );
  });

  it('documents zero-basis reconciliation and no-invention insert invariants', async () => {
    const sql = await load0069Sql();
    expect(sql).toMatch(/Unconditional: zero basis must also match/i);
    expect(sql).toMatch(/Master row creation never claims stock value/i);
    expect(sql).toMatch(/INSERT never invents economic stock value/i);
  });

  it('uses ON DELETE RESTRICT for inventory layer and consumption item FKs', async () => {
    const sql = await load0069Sql();
    const layerFk = sql.match(
      /ADD CONSTRAINT inventory_cost_layers_item_org_fk[\s\S]*?;/,
    )?.[0];
    const consumptionFk = sql.match(
      /ADD CONSTRAINT inventory_cost_consumptions_item_org_fk[\s\S]*?;/,
    )?.[0];
    expect(layerFk).toBeTruthy();
    expect(consumptionFk).toBeTruthy();
    expect(layerFk).toMatch(/ON DELETE RESTRICT/);
    expect(consumptionFk).toMatch(/ON DELETE RESTRICT/);
    expect(layerFk).not.toMatch(/ON DELETE CASCADE/);
    expect(consumptionFk).not.toMatch(/ON DELETE CASCADE/);
  });

  it('requires writeoff/adjust consumptions have project_id IS NULL in project_shape', async () => {
    const sql = await load0069Sql();
    expect(sql).toContain('inventory_cost_consumptions_project_shape');
    expect(sql).toMatch(
      /inventory_cost_consumptions_project_shape[\s\S]*kind = 'project_consume'[\s\S]*project_id IS NOT NULL/,
    );
    expect(sql).toMatch(
      /inventory_cost_consumptions_project_shape[\s\S]*kind IN \('writeoff', 'adjust'\)[\s\S]*project_id IS NULL/,
    );
  });

  it('defines inventory_cost_layers_currency_guard for single-currency layers per item', async () => {
    const sql = await load0069Sql();
    const guard = extractFunctionBody(sql, 'inventory_cost_layers_currency_guard');

    expect(guard).toMatch(/inventory_cost_layer_currency_mismatch/);
    expect(guard).toMatch(/cost_basis_currency/);
    expect(guard).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(
      /CREATE TRIGGER inventory_cost_layers_currency_guard[\s\S]*BEFORE INSERT OR UPDATE OF currency, inventory_item_id[\s\S]*EXECUTE FUNCTION app\.inventory_cost_layers_currency_guard\(\)/,
    );
  });

  describe('0069 FINAL ADVERSARIAL SQL REVIEW — mechanism assertions', () => {
    it('1A: schedule closed guard validates OLD and NEW org/month separately', async () => {
      const guard = extractFunctionBody(await load0069Sql(), 'expense_managerial_schedule_closed_guard');
      expect(guard).toMatch(
        /UPDATE[\s\S]*is_month_closed_unrestricted\(OLD\.organization_id, OLD\.year_month\)/,
      );
      expect(guard).toMatch(
        /UPDATE[\s\S]*is_month_closed_unrestricted\(NEW\.organization_id, NEW\.year_month\)/,
      );
      expect(guard).not.toMatch(
        /UPDATE[\s\S]*is_month_closed_unrestricted\(org_id, OLD\.year_month\)/,
      );
    });

    it('1B: frozen child guard checks OLD and NEW parent months (not COALESCE shortcut)', async () => {
      const guard = extractFunctionBody(await load0069Sql(), 'general_cost_month_frozen_guard');
      expect(guard).toMatch(/OLD\.general_cost_month_id/);
      expect(guard).toMatch(/NEW\.general_cost_month_id/);
      expect(guard).not.toMatch(/COALESCE\(NEW\.general_cost_month_id, OLD\.general_cost_month_id\)/);
    });

    it('1C: frozen general_cost_month row is fully immutable', async () => {
      const guard = extractFunctionBody(await load0069Sql(), 'general_cost_month_frozen_guard');
      expect(guard).toMatch(/OLD\.status = 'frozen'/);
      expect(guard).toMatch(/NEW\.frozen_at IS DISTINCT FROM OLD\.frozen_at/);
      expect(guard).toMatch(/NEW\.computed_at IS DISTINCT FROM OLD\.computed_at/);
      expect(guard).toMatch(/NEW\.created_at IS DISTINCT FROM OLD\.created_at/);
    });

    it('1D / CHECKLIST #6: blocks move into closed Month Close target while status open', async () => {
      const guard = extractFunctionBody(await load0069Sql(), 'general_cost_month_closed_period_guard');
      expect(guard).toMatch(/is_month_closed_unrestricted\(NEW\.organization_id, NEW\.year_month\)/);
      expect(guard).toMatch(/NEW\.year_month IS DISTINCT FROM OLD\.year_month/);
      expect(guard).toMatch(/NEW\.status = 'open'/);
      expect(guard).toMatch(/general_cost_month_closed_period: cannot target closed month/);
    });

    it('2A: schedule lines use parent-aware expense RLS', async () => {
      const sql = await load0069Sql();
      expect(sql).toMatch(
        /install_org_parent_table_rls\([\s\S]*'expense_managerial_schedule_lines'[\s\S]*'expenses'[\s\S]*'expense_id'/,
      );
    });

    it('2B: general_cost_month_allocations RLS includes project_id', async () => {
      const sql = await load0069Sql();
      expect(sql).toMatch(
        /install_org_table_rls\([\s\S]*'general_cost_month_allocations'[\s\S]*'project_id'/,
      );
    });

    it('3: recurring amount versions are expense-draft only', async () => {
      const sql = await load0069Sql();
      expect(sql).toContain('recurring_financial_drafts_expense_semantics');
      expect(sql).toContain('recurring_draft_amount_versions_expense_only');
      expect(sql).toMatch(/draft_kind = 'expense'/);
      expect(sql).toMatch(/ON DELETE RESTRICT/);
    });

    it('3A: amount-version history allows close-only UPDATE (id/notes/created_at protected)', async () => {
      const guard = extractFunctionBody(
        await load0069Sql(),
        'recurring_draft_amount_versions_history_guard',
      );
      expect(guard).toMatch(/NEW\.id IS NOT DISTINCT FROM OLD\.id/);
      expect(guard).toMatch(/NEW\.notes IS NOT DISTINCT FROM OLD\.notes/);
      expect(guard).toMatch(/NEW\.created_at IS NOT DISTINCT FROM OLD\.created_at/);
    });

    it('4A–4C: expense economic guards and inventory/installment exclusivity', async () => {
      const sql = await load0069Sql();
      expect(sql).toContain('expenses_economic_settings_guard');
      expect(sql).toContain('expenses_economic_settings_immutable');
      expect(sql).toContain('expenses_inventory_installment_exclusive');
      expect(sql).toContain('expense_managerial_schedule_currency_guard');
      const econ = extractFunctionBody(sql, 'expenses_economic_settings_guard');
      expect(econ).toMatch(/installment_count/);
      expect(econ).toMatch(/inventory_stock_purchase/);
      expect(econ).toMatch(/expense_currency_schedule_locked/);
    });

    it('5A: inventory cost-basis uses non-forgeable next_gen_latch (not GUC alone)', async () => {
      const sql = await load0069Sql();
      const guard = extractFunctionBody(sql, 'inventory_items_cost_basis_guard');
      const reconcile = extractFunctionBody(sql, 'inventory_items_cost_basis_reconcile');
      expect(guard).toMatch(/next_gen_latch_held\('inventory_cost_basis'\)/);
      expect(reconcile).toMatch(/next_gen_latch_held\('inventory_cost_basis'\)/);
      expect(guard).not.toMatch(/inventory_cost_basis_write/);
    });

    it('5C / CHECKLIST #21: expense layer value must match Expense NET (qty × unit_cost)', async () => {
      const guard = extractFunctionBody(
        await load0069Sql(),
        'inventory_cost_layers_expense_source_guard',
      );
      expect(guard).toMatch(/inventory_stock_purchase/);
      expect(guard).toMatch(/inventory_purchase_qty IS DISTINCT FROM NEW\.received_qty/);
      expect(guard).toMatch(
        /abs\(\(NEW\.received_qty \* NEW\.unit_cost\) - v_exp\.net_amount::numeric\) >= 0\.000001/,
      );
    });

    it('5D: ap_bill FIFO source disabled at SQL layer', async () => {
      const sql = await load0069Sql();
      const shapeBlocks = sql.match(
        /ADD CONSTRAINT inventory_cost_layers_source_shape[\s\S]*?CHECK \([\s\S]*?\);/g,
      );
      expect(shapeBlocks?.length).toBeGreaterThanOrEqual(1);
      for (const block of shapeBlocks ?? []) {
        expect(block).not.toMatch(/source_kind = 'ap_bill'/);
      }
      expect(sql).toMatch(/DROP INDEX IF EXISTS inventory_cost_layers_source_ap_bill_uq/);
    });

    it('5E / CHECKLIST #23: consumption occurred_on must match movement/material source date', async () => {
      const guard = extractFunctionBody(
        await load0069Sql(),
        'inventory_cost_consumptions_source_provenance_guard',
      );
      expect(guard).toMatch(/inventory_cost_consumption_movement_mismatch/);
      expect(guard).toMatch(/inventory_cost_consumption_movement_date_mismatch/);
      expect(guard).toMatch(/m\.occurred_on/);
      expect(guard).toMatch(/inventory_cost_consumption_material_date_mismatch/);
      expect(guard).toMatch(/mu\.usage_date/);
      expect(guard).toMatch(/NEW\.occurred_on IS DISTINCT FROM v_mov_date/);
      expect(guard).toMatch(/NEW\.occurred_on IS DISTINCT FROM v_mu_date/);
    });

    it('CHECKLIST #27: cost basis reconciles ALL layers; blocks currency filter bypass', async () => {
      const reconcile = extractFunctionBody(
        await load0069Sql(),
        'inventory_items_cost_basis_reconcile',
      );
      expect(reconcile).toMatch(/inventory_items_cost_basis_currency_mismatch/);
      expect(reconcile).not.toMatch(/upper\(l\.currency\) = upper\(NEW\.cost_basis_currency\)/);
      expect(reconcile).toMatch(/v_layer_sum >= 0\.000001/);
      expect(reconcile).toMatch(/l\.remaining_qty > 0/);
    });
  });
});

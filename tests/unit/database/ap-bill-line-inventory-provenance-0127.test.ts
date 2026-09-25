import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SQL_PATH = path.join(
  process.cwd(),
  'drizzle/migrations/0127_ap_bill_line_inventory_provenance.sql',
);

describe('0127 AP bill line inventory provenance', () => {
  it('ties the FIFO layer to the bill line of that bill', async () => {
    const sql = await readFile(SQL_PATH, 'utf8');
    expect(sql).toContain('ap_bill_lines_id_bill_org_uq');
    expect(sql).toMatch(
      /inventory_cost_layers_source_ap_bill_line_bill_fk[\s\S]*FOREIGN KEY \(source_ap_bill_line_id, source_ap_bill_id, organization_id\)[\s\S]*REFERENCES public\.ap_bill_lines \(id, ap_bill_id, organization_id\)[\s\S]*ON DELETE RESTRICT/,
    );
    expect(sql).not.toMatch(/CREATE UNIQUE INDEX[\s\S]*inventory_cost_layers_source_ap_bill_uq/);
  });

  it('requires the stored line NET, quantity, item, currency, and a recognized bill', async () => {
    const sql = await readFile(SQL_PATH, 'utf8');
    const guard = sql.slice(
      sql.indexOf('FUNCTION app.inventory_cost_layers_ap_source_guard'),
      sql.indexOf('DROP TRIGGER IF EXISTS inventory_cost_layers_ap_source_guard'),
    );
    expect(guard).toMatch(/NEW\.source_kind IS DISTINCT FROM 'ap_bill'/);
    expect(guard).toMatch(/v_line\.ap_bill_id IS DISTINCT FROM NEW\.source_ap_bill_id/);
    expect(guard).toMatch(/v_line\.organization_id IS DISTINCT FROM NEW\.organization_id/);
    expect(guard).toMatch(/v_line\.inventory_item_id IS DISTINCT FROM NEW\.inventory_item_id/);
    expect(guard).toMatch(/app\.is_ap_bill_recognized_status\(v_line\.status\)/);
    expect(guard).toMatch(/v_line\.quantity::numeric <= 0/);
    expect(guard).toMatch(/v_line\.quantity IS DISTINCT FROM NEW\.received_qty/);
    expect(guard).toMatch(/upper\(v_line\.currency\) <> upper\(NEW\.currency\)/);
    expect(guard).toMatch(
      /abs\(\(NEW\.received_qty \* NEW\.unit_cost\) - v_line\.net_amount::numeric\) >= 0\.000001/,
    );
    expect(guard).not.toMatch(/gross_amount/);
    expect(guard).not.toMatch(/tax_amount/);
    expect(guard).toMatch(/inventory_cost_layer_ap_source_mismatch/);
  });

  it('freezes the inventory item on a recognized line and the source economics after a layer exists', async () => {
    const sql = await readFile(SQL_PATH, 'utf8');
    const guard = sql.slice(
      sql.indexOf('FUNCTION app.ap_bill_lines_inventory_attribution_guard'),
      sql.indexOf('DROP TRIGGER IF EXISTS ap_bill_lines_inventory_attribution_guard'),
    );
    expect(guard).toMatch(/ap_bill_line_inventory_item_immutable/);
    expect(guard).toMatch(/ap_bill_line_inventory_source_immutable/);
    expect(guard).toMatch(/NEW\.inventory_item_id IS DISTINCT FROM OLD\.inventory_item_id/);
    expect(guard).toMatch(/NEW\.quantity IS DISTINCT FROM OLD\.quantity/);
    expect(guard).toMatch(/NEW\.net_amount IS DISTINCT FROM OLD\.net_amount/);
    expect(guard).toMatch(/NEW\.currency IS DISTINCT FROM OLD\.currency/);
    expect(guard).toMatch(/NEW\.ap_bill_id IS DISTINCT FROM OLD\.ap_bill_id/);
    expect(guard).not.toMatch(/internal_financial_edit_latch_held/);
  });
});

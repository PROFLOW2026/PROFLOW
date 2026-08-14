import { sql } from 'drizzle-orm';
import { resultRows } from './database';

type DraftNodeExecutor = {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
};

/** 0042 revoked authenticated DML on boq_nodes; draft writes go through this RPC. */
export async function insertDraftBoqNodeViaRpc(
  tx: DraftNodeExecutor,
  input: {
    organizationId: string;
    boqId: string;
    description: string;
    nodeKind?: 'item' | 'chapter';
    pricingType?: 'quantity_unit_price' | 'lump_sum';
    quantity?: number | string;
    unitPrice?: number | string;
    amount?: number | string;
    parentId?: string | null;
    itemCode?: string | null;
  },
): Promise<string> {
  const qty = input.quantity ?? 10;
  const price = input.unitPrice ?? 100;
  const amount = input.amount ?? Number(qty) * Number(price);
  const rows = resultRows<{ id: string }>(
    await tx.execute(sql`
      SELECT app.boq_mutate_draft_node(
        ${input.organizationId}::uuid,
        'insert',
        NULL::uuid,
        jsonb_build_object(
          'boq_id', ${input.boqId}::uuid,
          'parent_id', ${input.parentId ?? null}::uuid,
          'node_kind', ${input.nodeKind ?? 'item'}::text,
          'item_code', ${input.itemCode ?? null}::text,
          'description', ${input.description}::text,
          'pricing_type', ${input.pricingType ?? 'quantity_unit_price'}::text,
          'original_quantity', ${String(qty)}::numeric,
          'original_unit_price', ${String(price)}::numeric,
          'original_amount', ${String(amount)}::numeric,
          'current_quantity', ${String(qty)}::numeric,
          'current_unit_price', ${String(price)}::numeric,
          'current_amount', ${String(amount)}::numeric
        )
      ) AS id
    `),
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('Failed to insert draft BOQ node via RPC');
  return id;
}

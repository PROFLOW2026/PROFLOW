# BOQ Lifecycle

## Version states

`project_boqs.status`:

| Status | Meaning |
|--------|---------|
| `draft` | Editable baseline (`original_*` = `current_*`) |
| `active` | One per project; originals locked |
| `superseded` | Replaced by a newer active version |
| `archived` | Soft-closed |

## Item nodes

`boq_nodes.node_kind`: `chapter` | `item`

Money columns:

- `original_*` — frozen after BOQ activates
- `current_*` — original ± approved change allocations
- `opening_approved_quantity` / `opening_billed_quantity` — mid-project baselines (not historical `billing_records`)

## Progress batches

`boq_progress_batches.status`:

```text
draft → approved → billed
         ↘ superseded / voided
```

Rules:

- Cumulative approved qty cannot exceed **current** quantity (hard block) unless an explicit deduction/correction path exists
- Cannot reduce current qty below already approved/billed cumulative without correction
- Draft batches are editable; billed/superseded/voided history is locked

## Change allocation

Only **approved** change orders allocate into an **active** BOQ. Pending requests never write.

Change **allocation_kind** values: `quantity_change`, `unit_price_change`, `new_item`, `unallocated_contract` (plus immutable history kinds `reversal` / `correction`).

**Not** a change allocation kind: `lump_sum`.

Node **`pricing_type = lump_sum`** remains valid for BOQ items. That is node pricing, not an allocation kind.

- Monetary change on a lump-sum-priced item uses `unit_price_change` (current price / amount path).
- `quantity_change` against `pricing_type = lump_sum` is blocked (no silent zero-money change).
- `new_item` may create either `quantity_unit_price` or `lump_sum` nodes; the source allocation stores both quantity and unit-price deltas so exact LIFO reversal returns current qty/price/amount to zero.

## Subcontractor schedule lifecycle

```text
schedule draft/active → cost lines → valuation draft → (manual AP vendor bill proposal)
```

Status `proposed_ap` is reserved for a future explicit draft-safe AP handoff. Current wave stops at durable valuation + manual AP note.

## User-visible happy path

Project → כתב כמויות → create/import → activate → progress → approve → create progress bill → CO updates current → no double bill → no fake Actual.

# PROJECTFLOW BOQ — OWNER V3 APPLY BLOCKERS (V4 bundle)

**Overall status:** READY FOR OWNER APPLY REVIEW — V4  
**Date:** 2026-08-14  

Owner Supabase apply = **NONE**  
Commit = **NONE**  
Push = **NONE**  
Portal = **OFF**  
0000–0034 = **UNTOUCHED** (0035 §16 + billing barrel / lifecycle docs / tests only)

## V3 apply blocker gates

| Gate | Result |
|------|--------|
| Secure views require `boq.read` | **PASS** |
| No-read org member + contracts.read secure-view access | **BLOCKED** |
| Money masking after `boq.read` | **PASS** |
| new_item quantity/unit-price reversal | **PASS** |
| new_item lump-sum reversal | **PASS** |
| new_item exact financial neutralization | **PASS** |
| lump_sum node + quantity_change | **BLOCKED** |
| Unguarded `finalizeBillingRecordCore` public export | **NO** |
| BOQ lifecycle allocation-kind docs | **TRUTHFUL** |
| Prior concurrency / billing / Playwright gates | **RETAINED** |
| Reviewer A / B / C remaining | **0 / 0 / 0** |
| BLOCKER / HIGH / MEDIUM / LOW | **0 / 0 / 0 / 0** |
| Known residuals | **NONE** |

## 0035 §16 additions

- `app.boq_can_read(organization_id)` — membership **and** `boq.read`
- All five BOQ secure views filter with `boq_can_read` (money remains second gate via `boq_can_see_money`)
- `new_item` source stores `unit_price_delta = new unit price` for exact reverse neutralization
- `quantity_change` on `pricing_type = lump_sum` nodes rejected

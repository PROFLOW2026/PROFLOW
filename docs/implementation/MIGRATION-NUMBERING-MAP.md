# Lead migration numbering map (Wave 4)

**Authority:** Lead only. Agents propose; Lead assigns journal numbers.  
**Frozen applied locally (not remote):** `0009`–`0013`.  
**Do not edit:** frozen `0012_ap_vendor_portal` SQL.

## Current local chain (journal)

| # | Tag | Status |
|---|-----|--------|
| 0009 | `wave2_foundations` | Local only |
| 0010 | `procurement_foundations` | Local only |
| 0011 | `field_ops_assets` | Local only |
| 0012 | `ap_vendor_portal` | Local — **FREEZE READY** |
| 0013 | `document_owner_types` | Local — freeze notes |

## Reserved proposals (no SQL authored / not in journal)

Multiple Wave 4 agents wrote `0014-*` proposal docs. **Only one** may become the next journal entry. Until Lead freezes the next checkpoint, treat these as **proposals**, not booked numbers:

| Proposed id (doc) | Topic | Priority for next checkpoint |
|-------------------|--------|-------------------------------|
| `0014_ocr_foundations` | Persist OCR jobs (optional; in-memory works for product) | Defer unless multi-instance durability required |
| `0014` tenant indexes | Org indexes on field-ops/procurement children | LOW/MED — defer |
| `0014` document `contract` owner type | Enum expansion | Optional; label workaround works |
| `0014` vendor portal candidates | Durable AP/compliance candidate store | Optional; in-memory candidates work for preview |
| `0015_api_webhook_hardening` | `event_id` / `last_http_status` columns | Optional; app encodes today |
| Docs 00–18 audit suggestions | Project RBAC / budget-ETC | **POST next checkpoint** — do not steal 0014/0015 from above without Lead rewrite |

## Rule for agents

1. Prefer **application-only** solutions until remote `0009`–`0013` is applied.  
2. If schema is unavoidable, write a **proposal md** with a **suggested** next free number after consulting this map — never invent overlapping journal SQL.  
3. Lead will rename proposals into a single ordered chain (`0014`, `0015`, …) when freezing the next remote checkpoint.

## Owner actions (not requested yet)

- Apply remote migrations `0009`–`0013` (and any later frozen `0014+`) in one checkpoint  
- Private `documents` storage bucket (`STORAGE-BUCKET-OWNER-ACTION.md`)  
- OCR / Resend / other credentials when enabling live providers  

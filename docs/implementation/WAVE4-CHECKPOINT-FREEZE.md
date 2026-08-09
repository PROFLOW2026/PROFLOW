# Wave 4 checkpoint — migration freeze

**Date:** 2026-08-09  
**Status:** FREEZE for remote apply of **0009–0013** only  
**Do not push** until owner applies remotes and Lead runs the final gate.

## Frozen local chain (apply remotely)

| Migration | Notes |
|-----------|--------|
| `0009_wave2_foundations` | Wave 2 foundations |
| `0010_procurement_foundations` | Procurement |
| `0011_field_ops_assets` | Field ops / assets |
| `0012_ap_vendor_portal` | AP + vendor portal — **freeze-ready** (no further SQL edits) |
| `0013_document_owner_types` | Document owner enum expansion |

## Not in this checkpoint

All `0014+` / `0015+` docs under `docs/implementation/` remain **proposals only**  
(see `MIGRATION-NUMBERING-MAP.md`). Do not invent/apply them with this remote set.

## Owner actions (report only — not requested as live ops here)

1. Apply remotes **0009→0013** in order (see `UPGRADE-FROM-0008.md` if upgrading from 0008).  
2. Private `documents` storage bucket — `STORAGE-BUCKET-OWNER-ACTION.md`.  
3. After remotes land: Lead runs full final gate, then push.

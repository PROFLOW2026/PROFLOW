# Electrical takeoff — security notes

## Where files live (no personal cloud)

| Asset | Storage record | Provider bytes |
|--------|----------------|----------------|
| Source PDF/DWG/DXF | `documents` row (`takeoff_files.storage_document_id` = document id) | Org primary connection → project `plans` folder (`externalProviderFileStore.put`) |
| Worker previews/overlays/masks | `documents` row (`takeoff_artifacts.evidence_id`) | Same org connection / `plans` |
| Exports (xlsx) | Generated in app memory | Not persisted unless user saves elsewhere |
| Exports (pdf) | Worker response stream | Optional future document row |

Employees and contractors **never** receive provider OAuth tokens. Uploads and downloads use org-configured storage only (`src/modules/evidence/server.ts` → `externalProviderFileStore`).

Tests / Playwright: `TAKEOFF_FILE_STORE=memory` uses `createInMemoryTakeoffFileStore()` only inside the test harness.

## Worker file access

- Job dispatched with `files[].downloadUrl` → `GET /api/takeoff/worker/file/{jobId}/{fileId}`.
- Authorization: HMAC bearer (`sealJobToken`) verified against `takeoff_jobs.token_hash` + expiry.
- Export annotated PDF: worker downloads source via the same bearer, then `export_for_request('annotated-pdf', …, source_path=…)`.

## Threat model (summary)

| Threat | Mitigation |
|--------|------------|
| Malicious PDF/DWG | Chunk cap; 250 MB cap; magic-byte gate; worker limits |
| SSRF via `downloadUrl` | URLs issued only by app; path under `/api/takeoff/worker/file/` |
| Token replay | HMAC + hash + TTL; constant-time verify |
| Tenant isolation | org/project FKs; RLS; use-case permission checks |
| Path traversal filenames | `path.basename` + forbidden chars strip on begin upload |
| Cross-org artifact/id | Repository org filters + session org context |

## Three-surface parity

Internal: `takeoff.*` org permissions + project capability.  
Contractor: `ext.takeoff.*` on active grants (`routes.ts` external mirrors).  
Employee: same `takeoff.*` as internal when role template includes keys (`role-templates.ts` manager; owner via full template).

Intentional limitation: worker HTTP bridge is server-only (no browser worker token).
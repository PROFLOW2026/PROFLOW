# 75 — Storage & Documents Blueprint

**Status:** Planning blueprint  
**Locked:** J5 Supabase Storage private  
**Phase:** No buckets provisioned yet

---

## 1. Separation

| Layer | Stores |
|-------|--------|
| PostgreSQL `documents` + `document_links` | Metadata, ownership, permissions context, storage pointer, mime, size, checksum |
| Supabase Storage | Binary object bytes |

No file-manager product in V1. Attachments support approvals, expenses, billing evidence, etc.

---

## 2. Bucket strategy

**V1:** one private bucket, e.g. `documents` (name finalizable at provision).

- Private by default  
- No permanent public URLs as security model  
- Access via authorization-aware signed URLs or authenticated download proxy

---

## 3. Object path strategy

Conceptual:

```text
organizations/{organizationId}/documents/{documentId}/{safeFilename}
```

Rules:

- `documentId` (UUID) is identity; original filename is **display metadata only**  
- Sanitize filename for path segment (no path traversal)  
- Organization UUID in path is acceptable for ops/debug; **security must not rely on path obscurity** — always check membership + document row + permissions  
- Do not trust client-provided paths; server generates path after creating `documents` row

---

## 4. Upload flow (authorized)

```text
1. Authenticate + active org + permission (documents.manage / feature-specific)
2. Validate mime + size limits (server)
3. Insert documents row (status=pending) with generated storage_path
4. Issue signed upload URL OR upload via server
5. Finalize row (checksum/size); link via document_links
6. AuditEvent for sensitive attachments
```

Download:

```text
1. Authz check on document + org
2. Short-lived signed URL OR stream via Route Handler
```

---

## 5. Validation (baseline — tune in Wave 0/1)

| Constraint | Proposal |
|------------|----------|
| Max size V1 | Start conservative (e.g. 10–25 MB); raise later |
| Types | PDF, common images, office docs as needed; reject executables |
| Resumable | Not required Wave 0; revisit for large drawings later |

---

## 6. Storage RLS / policies

Align with Supabase Storage policies:

- Read/write objects only if user is member of organization prefix **and** corresponding `documents` row allows  
- Prefer policy that joins/metadata checks rather than open prefix write  
- Service role for admin repair only

Exact SQL written with migrations / storage policy files under Integrator review (`77`).

---

## 7. StoragePort

```text
shared/storage/
  StoragePort  (upload, signedUpload, signedDownload, delete)
  supabaseStorageAdapter
```

Modules call the port via documents application use cases — not raw SDK from UI.

---

## 8. Wave scope

| Wave 0 | Wave 1–2 |
|--------|----------|
| Bucket + path convention + StoragePort + policy foundation + tests of deny/allow | Wire to expenses/approvals/billing UX |
| Minimal upload smoke (optional fixture) | Documents list UX polish |

---

## 9. Related

`09`, `74`, `72`

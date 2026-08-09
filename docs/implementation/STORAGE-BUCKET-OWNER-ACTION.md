# Storage bucket — residual owner action (Wave 4)

**Status:** Owner action complete (2026-08-09)  
**Bucket:** `documents` · **Access:** PRIVATE · **Policies:** 0 · MIME/size: defaults

## What app expects

- Private Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET` (default `documents`)
- No public permanent URLs — signed upload/download only via `StoragePort`
- Object keys: `{organizationId}/documents/{documentId}/{uuid}-{safeFilename}`
- App uses existing `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL` — **no new bucket secrets invented**
- Product UX (upload, preview, download, soft-delete) is implemented against this private signed-access model

## Owner confirmation

1. Private bucket `documents` exists
2. Bucket remains **private** (no anonymous public read)
3. Service-role signed URL create/upload/download is available against that bucket

Optional later (Integrator): storage RLS/policies aligning with org membership — not blocking Wave 4 link UX when service-role adapter is used.

## Related

- `docs/75-STORAGE-DOCUMENTS-BLUEPRINT.md`
- Migration `0013_document_owner_types.sql` (enum expansion; applied with remotes 0009–0013)

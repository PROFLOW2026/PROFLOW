# External Organization Storage Platform

Organization-level cloud storage for business files. ProjectFlow owns metadata; the customer's provider owns binary bytes.

## Architecture

- **Module:** `src/modules/external-storage/`
- **Provider interface:** `domain/provider-interface.ts`
- **Adapters:** `providers/onedrive.ts`, `google-drive.ts`, `dropbox.ts`, `box.ts`
- **Connection lifecycle:** `application/connection-service.ts`
- **Folder model:** `storage_folder_mappings` with `semantic_folder_type` (not Hebrew names)
- **File metadata:** `storage_files` linked to `documents` / `document_versions`
- **Tokens:** AES-256-GCM sealed in `app.storage_connection_credential_refs` (service_role only)

## Database (migration 0087)

- `organization_storage_connections`
- `storage_folder_mappings`
- `storage_files`
- `documents.storage_backend` + external pointer columns
- `document_versions` external pointer columns

**Owner must apply** `drizzle/migrations/0087_external_organization_storage.sql` before release.

## Upload lifecycle

1. `prepareDocumentUpload` — requires active primary connection; creates pending `documents` row
2. Browser POSTs bytes to `/api/org-storage/upload/[documentId]` (credentials included, no provider token in browser)
3. Server uploads to provider folder resolved by semantic type + entity mapping
4. `finalizeDocumentUpload` — verifies external metadata row; marks document available

Legacy Supabase rows (`storage_backend = supabase_legacy`) continue to read via `StoragePort`.

## OAuth

- Start: `GET /api/org-storage/oauth/{provider}/start`
- Callback: `GET /api/org-storage/oauth/{provider}/callback`
- Redirect URI pattern: `{APP_URL}/api/org-storage/oauth/{provider}/callback`

## Adding a fifth provider

1. Add provider key to `STORAGE_PROVIDERS` in `drizzle/schema/external-storage.ts` + migration CHECK
2. Implement `StorageProviderAdapter` in `providers/`
3. Register in `providers/registry.ts`
4. Add env vars to `server.ts` + `.env.example`
5. Add Hebrew strings in `externalStorage.json`

## Required environment variables

See `.env.example` — `STORAGE_TOKEN_ENCRYPTION_KEY` and per-provider OAuth client credentials.

## Manual app registration (Owner)

### Microsoft OneDrive

- Console: [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps)
- Type: Web
- Redirect URI: `https://<APP_URL>/api/org-storage/oauth/onedrive/callback`
- Scopes: `offline_access`, `User.Read`, `Files.ReadWrite`
- Env: `MICROSOFT_STORAGE_CLIENT_ID`, `MICROSOFT_STORAGE_CLIENT_SECRET`, optional `MICROSOFT_STORAGE_TENANT_ID`

### Google Drive

- Console: [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
- Type: OAuth client (Web)
- Redirect URI: `https://<APP_URL>/api/org-storage/oauth/google_drive/callback`
- Scopes: `drive`, `userinfo.email`
- Env: `GOOGLE_STORAGE_CLIENT_ID`, `GOOGLE_STORAGE_CLIENT_SECRET`

### Dropbox

- Console: [Dropbox App Console](https://www.dropbox.com/developers/apps)
- Type: Scoped access
- Redirect URI: `https://<APP_URL>/api/org-storage/oauth/dropbox/callback`
- Env: `DROPBOX_STORAGE_CLIENT_ID`, `DROPBOX_STORAGE_CLIENT_SECRET`

### Box

- Console: [Box Developer Console](https://app.box.com/developers/console)
- OAuth 2.0 redirect URI: `https://<APP_URL>/api/org-storage/oauth/box/callback`
- Env: `BOX_STORAGE_CLIENT_ID`, `BOX_STORAGE_CLIENT_SECRET`

## Legacy files

Existing Supabase-stored documents remain readable when `storage_backend = supabase_legacy`. No automatic migration; explicit import tool is future work.

## Settings UI

`/settings/storage` — connect, validate, disconnect, primary provider selection.

## Project files UI

Project → Documents tab includes folder browser (`ProjectFilesTab`) backed by provider listings.

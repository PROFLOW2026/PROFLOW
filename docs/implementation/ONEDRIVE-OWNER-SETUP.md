# OneDrive Owner Setup — ProjectFlow External Storage

Use this checklist after migration **0087** is applied and code is deployed to the target environment. ProjectFlow stores OAuth tokens encrypted; you only register the Microsoft app and populate environment variables.

## 1. Microsoft Entra app registration

1. Sign in to [Microsoft Entra admin center](https://entra.microsoft.com/).
2. **Identity → Applications → App registrations → New registration**.
3. **Name:** `ProjectFlow Storage` (or your org name).
4. **Supported account types:** choose based on who connects storage:
   - **Accounts in any organizational directory (multitenant)** — typical SaaS default.
   - **Single tenant** — only your Entra tenant; set `MICROSOFT_STORAGE_TENANT_ID` to that tenant ID.
5. **Redirect URI:** leave blank for now (add in step 2).
6. Click **Register**.

Record from the app **Overview** page:

| Value | Env variable |
|-------|----------------|
| Application (client) ID | `MICROSOFT_STORAGE_CLIENT_ID` |
| Directory (tenant) ID | `MICROSOFT_STORAGE_TENANT_ID` (optional; omit or use `common` for multitenant sign-in) |

## 2. Redirect URIs (exact)

ProjectFlow OAuth callback route:

```
{APP_URL}/api/org-storage/oauth/onedrive/callback
```

Add **Web** redirect URIs under **Authentication → Platform configurations → Web**:

| Environment | `APP_URL` | Redirect URI |
|-------------|-----------|--------------|
| Local dev | `http://localhost:3000` | `http://localhost:3000/api/org-storage/oauth/onedrive/callback` |
| Production | `https://<your-production-domain>` | `https://<your-production-domain>/api/org-storage/oauth/onedrive/callback` |

Rules:

- Scheme, host, port, and path must match **exactly** (no trailing slash on the callback path).
- `APP_URL` in that environment must equal the origin used in the redirect URI.
- If you use Vercel preview URLs for OAuth testing, add each preview origin separately (preview is optional; production + local are required).

Also enable **ID tokens** under **Authentication** if the portal requires implicit/id-token settings for your tenant policy (ProjectFlow uses authorization code flow only).

## 3. Client secret

1. **Certificates & secrets → Client secrets → New client secret**.
2. Copy the **Value** immediately (shown once).

| Value | Env variable |
|-------|----------------|
| Secret value | `MICROSOFT_STORAGE_CLIENT_SECRET` |

## 4. Microsoft Graph delegated permissions (exact scopes)

ProjectFlow OneDrive adapter requests these scopes at authorize time:

```
offline_access
User.Read
Files.ReadWrite
```

In Entra:

1. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**.
2. Add:
   - `User.Read`
   - `Files.ReadWrite`
3. `offline_access` is included automatically by Microsoft for refresh tokens in the v2 endpoint.
4. Click **Grant admin consent** for your tenant if your policy requires admin consent for `Files.ReadWrite`.

Do **not** add application permissions for this flow; ProjectFlow uses **delegated** user consent against the connecting admin's OneDrive.

## 5. Environment variables (complete list)

Set in `.env.local` (local) and Vercel **Production** (and Preview if testing OAuth there):

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `APP_URL` | Yes | `http://localhost:3000` or production URL |
| `STORAGE_TOKEN_ENCRYPTION_KEY` | Yes | 32+ byte secret (hex or strong passphrase). Generate once per environment; **do not rotate** without a re-connect plan. |
| `MICROSOFT_STORAGE_CLIENT_ID` | Yes | From app Overview → Application (client) ID |
| `MICROSOFT_STORAGE_CLIENT_SECRET` | Yes | From Certificates & secrets |
| `MICROSOFT_STORAGE_TENANT_ID` | Optional | Tenant GUID for single-tenant; omit or use `common` for multitenant |

`NEXT_PUBLIC_APP_URL` should match `APP_URL` for client-side links but is **not** used for OAuth redirect validation.

Reference: `.env.example` in the repo.

## 6. Where each value is obtained (quick map)

| Env variable | Azure / Entra location |
|--------------|------------------------|
| `MICROSOFT_STORAGE_CLIENT_ID` | App registration → **Overview** → Application (client) ID |
| `MICROSOFT_STORAGE_CLIENT_SECRET` | App registration → **Certificates & secrets** → Client secrets → Value |
| `MICROSOFT_STORAGE_TENANT_ID` | App registration → **Overview** → Directory (tenant) ID |
| Redirect URIs | App registration → **Authentication** → Web → Redirect URIs |
| Graph scopes | App registration → **API permissions** → Microsoft Graph delegated |
| `APP_URL` | Your deployment base URL (Vercel project → Domains, or local) |
| `STORAGE_TOKEN_ENCRYPTION_KEY` | Generate locally (`openssl rand -hex 32`) — not from Microsoft |

## 7. Connect in ProjectFlow

1. Start the app with the env vars above.
2. Sign in as an org admin with **settings.manage** permission.
3. Open **הגדרות → אחסון קבצים** (`/settings/storage`).
4. Click **חבר** on **Microsoft OneDrive**.
5. Complete Microsoft sign-in and consent.
6. Click **בדוק חיבור** — quota/account should appear.
7. Open a project → **קבצים** tab — upload, create folder, rename, move, delete should work without opening OneDrive.

## 8. Credentialled E2E (after setup)

Manual smoke checklist:

- [ ] OAuth connect + reconnect
- [ ] Upload file to semantic folder
- [ ] Create subfolder, upload into subfolder
- [ ] Rename file and folder
- [ ] Move file and folder between project folders
- [ ] Delete empty folder (confirm non-empty folder shows Hebrew error)
- [ ] Delete file with confirmation
- [ ] Preview/download opens file

---

**Status after Owner completes steps 1–7:** ready for credentialled OneDrive E2E in that environment.

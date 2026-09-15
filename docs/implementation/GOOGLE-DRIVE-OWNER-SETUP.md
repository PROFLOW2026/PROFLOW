# Google Drive Owner Setup — ProjectFlow External Storage

Use this checklist for **live Google Drive connection** after migration **0087** is applied and foundation code is deployed. ProjectFlow stores OAuth tokens encrypted server-side; you register the Google OAuth client and populate environment variables only.

## 1. Why full Drive scope is required (do not change without product review)

ProjectFlow requests:

```
https://www.googleapis.com/auth/drive
https://www.googleapis.com/auth/userinfo.email
```

Implemented in `src/modules/external-storage/providers/google-drive.ts`.

**Why not `drive.file`?** That scope only covers files the app created or the user opened through a Google picker. ProjectFlow must:

- Browse the full **ProjectFlow/** tree under My Drive
- Show folders/files created **directly in Google Drive** (refresh → appears in ProjectFlow)
- Upload, rename, move, delete across the org/project tree

Those behaviors require listing and mutating files under provider-resolved folder IDs without per-file picker consent. **`drive` is the minimum scope that satisfies the current architecture.**

`drive.file` is insufficient for dynamic provider-authoritative browsing.

## 2. Google Cloud project prerequisites

1. Sign in to [Google Cloud Console](https://console.cloud.google.com/).
2. Select or create a project (e.g. `ProjectFlow Storage`).
3. **APIs & Services → Library → enable [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)**.

No other Google API is required for the current adapter (account email comes from Drive `about` + OAuth `userinfo.email`).

## 3. OAuth consent screen

**APIs & Services → OAuth consent screen**

| Setting | Value |
|---------|--------|
| User type | **External** (typical) or Internal if Google Workspace org-only |
| App name | `ProjectFlow` |
| User support email | Owner email |
| Developer contact | Owner email |

**Scopes → Add or remove scopes → Manually add:**

- `.../auth/drive` (See, edit, create, and delete all of your Google Drive files)
- `.../auth/userinfo.email`

**Publishing status for live Owner testing:**

- Leave **Testing** until Google verification is completed (if ever needed for public rollout).
- Under **Test users**, add every Google account that will connect storage (Owner + any admins testing).
- Testing mode allows up to 100 test users without full restricted-scope verification.

> `drive` is a **restricted** scope. Public production (any Google user) may require Google OAuth verification and security assessment. **Testing mode + test users is sufficient for this live connection phase.**

## 4. OAuth client (Web application)

**APIs & Services → Credentials → Create credentials → OAuth client ID**

| Setting | Value |
|---------|--------|
| Application type | **Web application** |
| Name | `ProjectFlow Storage` |

### Authorized redirect URIs (exact — no trailing slash on path)

ProjectFlow builds redirect URI as:

```
{APP_URL}/api/org-storage/oauth/google_drive/callback
```

| Environment | `APP_URL` | Redirect URI |
|-------------|-----------|--------------|
| Local dev | `http://localhost:3100` | `http://localhost:3100/api/org-storage/oauth/google_drive/callback` |
| Production | `https://proflow-two-bice.vercel.app` | `https://proflow-two-bice.vercel.app/api/org-storage/oauth/google_drive/callback` |

Rules:

- Must match `APP_URL` in that environment exactly (scheme, host, port).
- Path segment is `google_drive` (underscore), not `google-drive`.

Record from the client:

| Value | Env variable |
|-------|----------------|
| Client ID | `GOOGLE_STORAGE_CLIENT_ID` |
| Client secret | `GOOGLE_STORAGE_CLIENT_SECRET` |

## 5. Environment variables

### Local (`.env.local`)

```env
APP_URL="http://localhost:3100"
STORAGE_TOKEN_ENCRYPTION_KEY="<existing — do not rotate casually>"
GOOGLE_STORAGE_CLIENT_ID="<from Google Cloud>"
GOOGLE_STORAGE_CLIENT_SECRET="<from Google Cloud>"
```

### Vercel Production

Add via Vercel dashboard or CLI:

```bash
vercel env add GOOGLE_STORAGE_CLIENT_ID production
vercel env add GOOGLE_STORAGE_CLIENT_SECRET production
```

**Current production status (check before connect):** OneDrive vars exist; Google vars must be added before Production connect works.

Redeploy Production after adding secrets if the connect button still shows "provider not configured".

Shared vars already required:

- `APP_URL` — production origin
- `STORAGE_TOKEN_ENCRYPTION_KEY` — token encryption at rest

## 6. Preflight verification (no browser)

From repo root after env is set:

```bash
node scripts/verify-google-oauth-preflight.mjs
```

Confirms client ID/secret present, prints redirect URI and scopes (never prints secret values).

## 7. Connect in ProjectFlow

1. Sign in as org admin with **settings.manage**.
2. Open **הגדרות → אחסון קבצים** (`/settings/storage`).
3. **Google Drive** row should show **Connect** (not "provider not configured").
4. Click **Connect** → Google account chooser (`prompt=select_account`).
5. Grant consent → callback to `/api/org-storage/oauth/google_drive/callback`.
6. Settings should show **connected**, account email, quota if available.
7. Click **Validate connection** if shown.
8. Optionally **Set as primary** (auto-promotes if no usable primary exists).

**Refresh token note:** First consent with `access_type=offline` should return a refresh token. If reconnect fails with "OAuth did not return a refresh token", revoke app access at [Google Account permissions](https://myaccount.google.com/permissions) and reconnect, or temporarily add `prompt=consent` (requires code change — report to dev).

## 8. Post-connect verification checklist

### ProjectFlow root

- Exactly one **ProjectFlow** folder at My Drive root (not nested duplicates).
- Under **ProjectFlow/**:
  - לקוחות
  - מסמכי חברה
  - ספקים
  - עובדים

### Company files (`/company-files`)

- List ProjectFlow root
- Create folder in UI → visible in drive.google.com
- Create folder in Google Drive under ProjectFlow → refresh UI → visible
- Upload PDF/image → preview → rename → move → delete

### Project files (Project → קבצים)

- Browse project root + defaults
- Arbitrary nested folders (no DB mapping)
- External folder created in Drive under project → refresh → visible

### Google Docs / Sheets / Slides

- Appear in browser listing
- No binary PDF preview (unsupported message + Open in Google Drive)

### Provider switching

- OneDrive connection remains
- Set Google primary → new uploads to Google
- Old OneDrive files still readable via OneDrive connection
- No automatic migration

---

**Status after Owner completes steps 1–7:** ready for live Google Drive verification in that environment.

# External professional tools — isolated verification, 2026-11-27

The feature is not complete. This note records what was actually run. It does not contain drawings, tokens, or production connection strings.

## Isolation

- Docker project: `exlfy-external-tools-test`
- Container and hostname: `exlfy-external-tools-pg`
- Network: `exlfy-external-tools-net`
- Volume: `exlfy-external-tools-pgdata`
- Host bind: `127.0.0.1:55432` to the container's own Postgres port
- Database: `exlfy_external_tools_test`
- User: `exlfy_test`
- Marker: `exlfy-external-tools-test-2026-11-27`
- Server address seen by the guarded migrator: `172.19.0.2/32`
- Guard refused any target that was not this host, port, database, user, marker, and container
- `.env.local` was not edited
- LEOKIDS containers were not stopped or changed
- Ports 5432, 54321, and 54322 were not used

A full local Supabase stack was not installed. The browser never receives a provider signed URL. Auth for a logged-in browser still depends on the existing app session, so the tools screens were not opened against this database.

## Migration

The guarded runner applied all 214 journal migrations, including `0217_external_professional_tools.sql`, only to `exlfy_external_tools_test`. Exit code 0.

Checked on that database:

- `external_tool_sessions`, files, parts, xrefs, edits, objects, and streams exist
- Row level security is enabled and forced on those tables
- Policy count is 0
- A role without `BYPASSRLS` sees 0 session rows and an insert is rejected by the row security policy
- `app.external_scopes_valid` contains `ext.tools.viewer` and `ext.tools.takeoff` and still contains the previous takeoff and folder scopes
- Permission keys `tools.external_viewer` and `tools.external_takeoff` exist
- After an owner role was created, the same owner backfill statement granted both keys
- An object row whose organization does not match its session is rejected with `external_tool_object_org_mismatch`
- An object row for the same organization is accepted

The org-match trigger was added to the unapplied production migration and then executed on this test database. It has not been applied anywhere else.

## Four drawings, anchor resolution on

Compared with the reconstructed HEAD baseline. Identities, positions, signatures, and detection counts are equal:

| File | Sheets | Detections | Legend | Result |
| --- | ---: | ---: | ---: | --- |
| 3643 | 10 | 1713 | 118 | same identities |
| 1545 | 1 | 1397 | 104 | same identities |
| 7155 | 8 | 446 | 30 | same identities |
| 3096 | 3 | 64 | 3 | same identities |

7155 still has eight sheet-level missing entries, all for one background that is not beside the host. The new resolver did not invent a file. Loaded references stayed 16.

3096 previously reported four backgrounds as `skipped (cycle)`. Those names are distinct files, not a document that contains itself. With `resolveXrefByAnchor` they load, missing references drop from 12 to 0, and the four false cycle warnings disappear. The counted symbols stay 64. Counting rules were not changed.

## Review connection

`externalAnalysisView` builds the existing analysis view with `applyEdits` and `computeBoq`. Library management stays closed. Temporary approval sets the existing workbook state to approved. Two unit tests passed, and the existing dispatch tests passed (10 tests in those two files).

The home screen now uploads 4 MB parts, locks them, and opens the existing review screen only after a verified result. That browser path was not exercised, because the running app is the existing dev server and the tools route redirects to sign-in.

## WASM

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `public/pf-cad/v1/wasm/pf_cad_wasm_bg.wasm` | 4369229 | `c99c606f116937a1ed6cd05a2466ad8e53d83e381349b7e43a6c7883b02ac458` |
| `public/pf-cad/v2/wasm/pf_cad_wasm_bg.wasm` | 5874217 | `c9a5bb4229a484dcc4c802e3540fdd379ffd16360fc82775dc8ff8d405c8822d` |
| `public/pf-cad/v3/wasm/pf_cad_wasm_bg.wasm` | 5874217 | `c9a5bb4229a484dcc4c802e3540fdd379ffd16360fc82775dc8ff8d405c8822d` |
| `public/pf-cad/external/wasm/pf_cad_wasm_bg.wasm` | 5887448 | `75230f86b8f41008037ed53e625f877a9f4e38465c67bbaf2995833267b42f40` |

The frozen tree hash is unchanged.

## Browser

The public home returned 200. `data-pf-design` was `current`, then `v9`, then `v10`. At a 390 CSS-pixel emulation of v10, `scrollWidth` equalled `clientWidth` (390). This is emulation, not a phone. The tools page itself was not opened.

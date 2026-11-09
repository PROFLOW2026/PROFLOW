# EXLFY IFC viewer — blocker note (2026-11-09)

## Attempt

- Tried adding optional BIM viewing via `web-ifc` (WASM) for `.ifc` files under project plans.
- `npm install web-ifc --save-optional` was started on the dev workstation; install had not finished within the sprint window (large WASM payload + lockfile churn).

## Blocker

1. **Bundle weight and Next.js client boundary** — `web-ifc` ships multi‑MB WASM; needs explicit dynamic import, worker path, and webpack/asset rules before a production-safe page.
2. **Install not verified in-repo** — without a completed install and smoke load, embedding `web-ifc-three` risks broken client builds on Windows dev paths.
3. **No server-side `.ifc` pipeline yet** — drawings/plans flow is PDF/image-first; IFC files are not indexed in the drawing register MIME allowlist.

## Recommended next step

1. Complete `web-ifc` install on Linux/Docker build host; add `IfcPreviewClient` with dynamic `import('web-ifc')` only.
2. Extend drawing/register MIME policy for `model/ifc` when product approves storage size limits.
3. Gate route behind `documents.view` + project capability, same as PDF workspace.

## Status

**Viewer not shipped in this sprint** — document blocker; PDF takeoff path remains the supported quantity capture surface.

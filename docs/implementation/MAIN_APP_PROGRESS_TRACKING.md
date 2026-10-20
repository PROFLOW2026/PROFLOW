# Main App design — progress tracking (Owner)

**Do not treat pattern detection or `MainAppPage` imports as “done”.**

## Pipeline (per route)

| Field | Set by | Meaning |
|--------|--------|---------|
| `codeTouched` | `update-main-app-manifest-status.mjs` (git diff) | Working tree differs from `HEAD` for page or traced module |
| `completionStatus` | `sync-main-app-manifest-from-source.mjs` | **Code structure only** — never owner sign-off |
| `implementationPipeline` | sync + manual flags | Human-readable stage |
| `visualVerified` | **Manual only** | Authenticated desktop/mobile check |
| `ownerApproved` | **Manual only** | Owner accepted UI |

### `completionStatus` (code structure)

| Value | Meaning |
|--------|---------|
| `NOT_STARTED` | No Main App shell/patterns detected |
| `WRAPPER_ONLY` | `MainAppPage` / `data-pf-ma-page` only |
| `PARTIAL` | Some patterns (section, table, toolbar, …) — **default for most touched routes** |
| `STRUCTURE_COMPLETE` | Archetype-specific minimum patterns in page **and** module trace (still not visual QA) |

**Forbidden as automatic “release ready”:** `COMPLETE`, `IMPLEMENTED`, or counts implying 250/257 routes finished.

### `implementationPipeline`

| Stage | When |
|--------|------|
| `NOT_STARTED` | No design code touch |
| `CODE_TOUCHED` | `codeTouched === true` |
| `CODE_REVIEWED` | Manual (`codeReviewed: true`) |
| `VISUALLY_VERIFIED` | Manual (`visualVerified: true`) |
| `OWNER_APPROVED` | Manual (`ownerApproved: true`) |

Sync **never** sets `CODE_REVIEWED`, `VISUALLY_VERIFIED`, or `OWNER_APPROVED`.

## Reference implementations

- **Vendors `/vendors`:** owner list with scoped CSS — recovery reference; `OWNER_APPROVED` only after Owner confirms.

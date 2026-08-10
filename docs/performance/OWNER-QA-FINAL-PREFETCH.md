# Owner QA Final — Prefetch strategy

## Default

Shell / authenticated chrome Links use **`prefetch={false}`**:

- `ShellNavLink` (sidebar, mobile primary, mobile-nav-more)
- `SectionNavLink` (settings section nav and other section tabs)
- `QuickCreate` menu Links
- `UserMenu` profile Link
- Project header client Link in `[projectId]/layout.tsx`

Goal: dashboard mount must not fire 40+ RSC prefetches for every nav destination (see prior `LIVE-VERIFICATION.json` ~43 `_rsc` resources).

## Opt-in (`prefetch`)

Only high-probability next actions:

| Surface | Link | Why |
|---------|------|-----|
| Home dashboard recent projects | `/projects/{id}` | Owner’s most likely next open from home |

No opt-in on main nav, quick-create, or settings section nav.

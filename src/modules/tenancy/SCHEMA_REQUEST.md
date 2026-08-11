# SCHEMA_REQUEST — Agent 11 (Business Profiles / Onboarding / Import)

No migration required for Agent 11 delivery.

Business profile configuration is stored in existing `organization_settings` keys:

- `business_profile`
- `work_mix` (existing)
- `work_terminology`
- `quick_create_emphasis`
- `business_profile_defaults`

Module visibility uses existing `organization_module_preferences`.
Cost categories / domains use existing catalog tables with `onConflictDoNothing`.

## Optional follow-ups (not blocking)

1. **Terminology consumption** — labels are persisted but shell/nav still uses locale JSON (`nav.projects`, `nav.jobs`). Wire `getTerminologyForOrg` into chrome when ready.
2. **Default work kind on create** — `business_profile_defaults.defaultWorkKind` is stored; project/job/work-order create forms do not yet preselect from it.
3. **Dedicated service create route** — Quick Create `service` currently points at `/work-orders/new` (Agent 6 surface).

No SQL changes requested.

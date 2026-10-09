# Customer & external portal status

**Last updated:** 2026-10-09 (Build wave 0)

## Customer portal (UI-001 / UI-002)

**Status: DEFER** — Owner decision. No broad customer-facing portal in this Build.

- No new routes, auth flows, or external customer identity beyond what already exists for **contractor** access.
- Product copy and nav must not imply a full customer self-service portal is available.

## Contractor portal

**Status: PRESERVE** — External principals (`0156`) and scoped grants remain the supported external access surface.

## Client operational approval (internal)

Authorized **internal** project members (e.g. `client_coordinator` template) may receive scoped operational approval capabilities in Build — **not** payroll, employer cost, or unrelated projects. This is separate from the deferred customer portal.
